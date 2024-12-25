import "water.css";
import "./App.css";

import { FetchHttpClient, HttpClient, HttpClientResponse } from "@effect/platform";
import { BrowserRuntime } from "@effect/platform-browser";
import { HashRouter, Route, useNavigate, useParams } from "@solidjs/router";
import { Effect, Either, Schema } from "effect";
import { type Component, createResource, For, Match, Show, Switch } from "solid-js";

const ClearskyListsSchema = Schema.Struct({
    data: Schema.Struct({
        lists: Schema.Array(Schema.Struct({
            did: Schema.String,
            url: Schema.String,
            name: Schema.String,
            description: Schema.NullishOr(Schema.String),
        })),
    }),
});

const getClearskyLists = (handle: string) =>
    Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient;
        const response = yield* client.get(`https://api.clearsky.services/api/v1/anon/get-list/${handle}`);
        const lists = yield* HttpClientResponse.schemaBodyJson(ClearskyListsSchema)(response);

        const seen = new Set<string>();
        return lists.data.lists.filter((list) => {
            if (seen.has(list.url)) {
                return false;
            }
            seen.add(list.url);
            return true;
        });
    });

const BlueskyListsSchema = Schema.Struct({
    list: Schema.Struct({
        purpose: Schema.String,
    }),
});

const getBlueskyList = (did: string, url: string) =>
    Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient;
        const id = url.split("/").at(-1);
        const at = `at://${did}/app.bsky.lists/${id}`;
        const response = yield* client.get(`https://public.api.bsky.app/xrpc/app.bsky.graph.getList?list=${at}`);
        const json = yield* HttpClientResponse.schemaBodyJson(BlueskyListsSchema)(response);
        return json.list;
    });

const BlueskyProfileSchema = Schema.Struct({
    did: Schema.String,
    handle: Schema.String,
    followersCount: Schema.Number,
});

const getBlueskyProfile = (handle: string) =>
    Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient;
        const response = yield* client.get(
            `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${handle}`,
        );
        const json = yield* HttpClientResponse.schemaBodyJson(BlueskyProfileSchema)(response);
        return json;
    });

// handle should already be URL safe
const doWork = (queryHandle: string) =>
    Effect.gen(function*() {
        const profile = yield* getBlueskyProfile(queryHandle);
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
    });

const fetchInfo = (handle: string) =>
    Effect.runPromise(
        doWork(handle)
            .pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer)),
    );

const Page: Component = () => {
    const navigate = useNavigate();
    const params = useParams<{ handle?: string | undefined; }>();
    const [info] = createResource(() => params.handle || undefined, fetchInfo);
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
                                    <a href={`https://bsky.app/profile/${list.profile.handle}`}>
                                        {list.profile.handle}
                                    </a>
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
