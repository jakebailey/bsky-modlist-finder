import "water.css/out/dark.min.css";
import "./App.css";

import { FetchHttpClient } from "@effect/platform";
import { HashRouter, Route, useNavigate, useParams } from "@solidjs/router";
import { Effect, Logger, LogLevel } from "effect";
import { type Component, createResource, For, Match, Show, Switch } from "solid-js";
import { getBlueskyList, getBlueskyProfile, getBlueskyProfiles, getClearskyLists } from "./apis";

// handle should already be URL safe
const doWork = (queryHandle: string) =>
    Effect.gen(function*() {
        yield* Effect.logDebug(`Fetching profile for ${queryHandle}`);
        const profile = yield* getBlueskyProfile(queryHandle);
        yield* Effect.logDebug(`Fetching lists for ${queryHandle}`);
        const clearskyLists = yield* getClearskyLists(queryHandle);

        const [, clearskyListsWithPurpose] = yield* Effect.partition(
            clearskyLists,
            (list) => getBlueskyList(list.did, list.url).pipe(Effect.map(({ purpose }) => ({ list, purpose }))),
            { concurrency: 5 },
        );

        const modClearskyLists = clearskyListsWithPurpose.filter(
            (list) => list.purpose === "app.bsky.graph.defs#modlist",
        ).map(({ list }) => list);

        const profiles = yield* Effect.orElseSucceed(
            getBlueskyProfiles(modClearskyLists.map((list) => list.did)),
            () => undefined,
        );

        if (!profiles?.size) {
            return { profile, lists: [] };
        }

        const lists = [];
        for (const list of modClearskyLists) {
            const profile = profiles.get(list.did);
            if (!profile || profile.handle === "handle.invalid") {
                continue;
            }
            lists.push({ profile, list });
        }

        // sort descending by followers count
        lists.sort((a, b) => b.profile.followersCount - a.profile.followersCount);

        return { profile, lists };
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
            <h1>Bluesky Moderation List Finder</h1>
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
                <input id="handle" type="text" placeholder="Enter handle, DID, or profile link" />
                <button type="submit">Submit</button>
            </form>

            <Show when={params.handle}>
                <p>Showing lists for {params.handle}</p>
            </Show>

            <Switch>
                <Match when={info.loading}>
                    <p>Loading...</p>
                </Match>
                <Match when={info.error}>
                    <span>Error: {`${info.error}`}</span>
                </Match>
                <Match when={info()}>
                    <details>
                        <summary>Profile</summary>
                        <p>
                            <a href={`${profilePrefix}${info()!.profile.handle}`}>{info()!.profile.handle}</a>
                            <Show when={info()!.profile.displayName}>
                                {" "}
                                ({info()!.profile.displayName})
                            </Show>
                        </p>
                        <Show when={info()!.profile.description}>
                            <p>{info()!.profile.description}</p>
                        </Show>
                    </details>

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
