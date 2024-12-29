import "water.css";
import "./App.css";

import { FetchHttpClient } from "@effect/platform";
import { HashRouter, Route, useNavigate, useParams } from "@solidjs/router";
import { Effect, Either, Logger, LogLevel } from "effect";
import { type Component, createResource, For, Match, Show, Switch } from "solid-js";
import { getBlueskyList, getBlueskyProfile, getClearskyLists } from "./apis";

// handle should already be URL safe
const doWork = (queryHandle: string) =>
    Effect.gen(function*() {
        yield* Effect.logDebug(`Fetching profile for ${queryHandle}`);
        const profile = yield* getBlueskyProfile(queryHandle);
        yield* Effect.logDebug(`Fetching lists for ${queryHandle}`);
        const clearskyLists = yield* getClearskyLists(queryHandle);

        const lists = [];
        const blueskyErrors = [];

        for (const list of clearskyLists) {
            const eitherBlueskyList = yield* Effect.either(getBlueskyList(list.did, list.url));
            if (Either.isLeft(eitherBlueskyList)) {
                blueskyErrors.push(eitherBlueskyList.left);
                continue;
            }

            const blueskyList = eitherBlueskyList.right;
            if (blueskyList.purpose !== "app.bsky.graph.defs#modlist") {
                continue;
            }

            const eitherBlueskyProfile = yield* Effect.either(getBlueskyProfile(list.did));
            if (Either.isLeft(eitherBlueskyProfile)) {
                blueskyErrors.push(eitherBlueskyProfile.left);
                continue;
            }

            const blueskyProfile = eitherBlueskyProfile.right;
            lists.push({
                profile: blueskyProfile,
                list,
            });
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

const Page: Component = () => {
    const navigate = useNavigate();
    const params = useParams<{ handle?: string | undefined; }>();
    const handle = params.handle || undefined;
    const [info] = createResource(() => handle, fetchInfo);
    return (
        <div>
            <h1>Bluesky Moderation List Finder</h1>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    navigate(`/${encodeURIComponent((e.target as HTMLFormElement).handle.value)}`);
                }}
            >
                <input id="handle" placeholder="Enter handle" />
                <button type="submit">Submit</button>
            </form>

            {handle ? <p>Showing lists for {handle}</p> : <p>Enter a handle to see their moderation lists</p>}

            <Switch>
                <Match when={info.loading}>
                    <p>Loading...</p>
                </Match>
                <Match when={info.error}>
                    <span>Error: {`${info.error}`}</span>
                </Match>
                <Match when={info()}>
                    <p>{info()!.profile.handle}</p>
                    <p>{info()!.lists.length} moderation lists</p>
                    <ul>
                        <For each={info()!.lists}>
                            {(list) => (
                                <li>
                                    <p>
                                        <a href={`https://bsky.app/profile/${list.profile.handle}`}>
                                            {list.profile.handle}
                                        </a>{" "}
                                        ({list.profile.followersCount} followers)
                                    </p>
                                    <p>{list.list.name}</p>
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
