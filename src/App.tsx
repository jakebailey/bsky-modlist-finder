import "water.css";
import "./App.css";

import { FetchHttpClient } from "@effect/platform";
import { HashRouter, Route, useNavigate, useParams } from "@solidjs/router";
import { Effect, Either, Logger, LogLevel } from "effect";
import { type Component, createResource, For, Match, Show, Switch } from "solid-js";
import { getBlueskyList, getBlueskyProfile, getBlueskyProfiles, getClearskyLists } from "./apis";

// handle should already be URL safe
const doWork = (queryHandle: string) =>
    Effect.gen(function*() {
        yield* Effect.logDebug(`Fetching profile for ${queryHandle}`);
        const profile = yield* getBlueskyProfile(queryHandle);
        yield* Effect.logDebug(`Fetching lists for ${queryHandle}`);
        const clearskyLists = yield* getClearskyLists(queryHandle);

        const [blueskyErrors, clearskyListsWithPurpose] = yield* Effect.partition(
            clearskyLists,
            (list) => getBlueskyList(list.did, list.url).pipe(Effect.map(({ purpose }) => ({ list, purpose }))),
            { concurrency: 5 },
        );

        const modClearskyLists = clearskyListsWithPurpose.filter(
            (list) => list.purpose === "app.bsky.graph.defs#modlist",
        ).map(({ list }) => list);

        const profiles = yield* Effect.either(getBlueskyProfiles(modClearskyLists.map((list) => list.did)));
        if (Either.isLeft(profiles)) {
            blueskyErrors.push(profiles.left);
            return { profile, lists: [], blueskyErrors };
        }

        const lists = [];
        for (const list of modClearskyLists) {
            const profile = profiles.right.get(list.did);
            if (!profile) {
                continue;
            }
            lists.push({ profile, list });
        }

        // sort descending by followers count
        lists.sort((a, b) => b.profile.followersCount - a.profile.followersCount);

        return { profile, lists, blueskyErrors };
    }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer));

const fetchInfo = (handle: string) => {
    return Effect.runPromise(
        doWork(handle)
            .pipe(
                Effect.scoped,
                Effect.provide(FetchHttpClient.layer),
                Logger.withMinimumLogLevel(LogLevel.Debug),
            ),
    );
};

const profilePrefix = "https://bsky.app/profile/";

const Page: Component = () => {
    const navigate = useNavigate();
    const params = useParams<{ handle?: string | undefined; }>();
    const [info] = createResource(() => params.handle || undefined, fetchInfo);
    return (
        <div>
            {/* TODO: don't inline */}
            <h1 style={{ "text-align": "center" }}>Bluesky Moderation List Finder</h1>
            <br />
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    let value = (e.target as HTMLFormElement).handle.value;
                    if (value.startsWith(profilePrefix)) {
                        value = value.slice(profilePrefix.length);
                        value = value.split("/")[0];
                    }
                    navigate(`/${encodeURIComponent(value)}`);
                }}
            >
                <input id="handle" placeholder="Enter handle, DID, or profile link" style={{ width: "100%" }} />
                <button type="submit">Submit</button>
            </form>

            {params.handle
                ? <p>Showing lists for {params.handle}</p>
                : <p>Enter a handle to see their moderation lists</p>}

            <Switch>
                <Match when={info.loading}>
                    <p>Loading...</p>
                </Match>
                <Match when={info.error}>
                    <span>Error: {`${info.error}`}</span>
                </Match>
                <Match when={info()}>
                    <p>{info()!.lists.length} moderation lists</p>
                    <ul>
                        <For each={info()!.lists}>
                            {(list) => (
                                <li>
                                    <p>
                                        <a href={list.list.url}>{list.list.name}</a> by{" "}
                                        <a href={`${profilePrefix}${list.profile.handle}`}>
                                            {list.profile.handle}
                                        </a>{" "}
                                        ({list.profile.followersCount} followers)
                                    </p>
                                    <Show when={list.list.description}>
                                        <p>{list.list.description}</p>
                                    </Show>
                                </li>
                            )}
                        </For>
                    </ul>
                    <p>{info()!.blueskyErrors.length} errors</p>
                    <ul>
                        <For each={info()!.blueskyErrors}>
                            {(error) => <li>{`${error}`}</li>}
                        </For>
                    </ul>
                </Match>
            </Switch>
        </div>
    );
};

const App: Component = () => {
    return (
        <HashRouter root={(props) => <>{props.children}</>}>
            <Route path="/:handle?" component={Page} />
        </HashRouter>
    );
};

export default App;
