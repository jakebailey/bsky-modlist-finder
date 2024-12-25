import "water.css";
import "./App.css";

import { HttpClient, HttpClientResponse } from "@effect/platform";
import { BrowserRuntime } from "@effect/platform-browser";
import { HashRouter, Route, useNavigate, useParams } from "@solidjs/router";
import { Effect, Schema } from "effect";
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
        return lists.data.lists;
    });

const BlueskyListsSchema = Schema.Struct({
    list: Schema.Struct({
        purpose: Schema.String,
    }),
});

const getBlueskyList = (list: typeof ClearskyListsSchema.Type.data.lists[number]) =>
    Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient;
        const id = list.url.split("/").at(-1);
        const at = `at://${list.did}/app.bsky.lists/${id}`;
        const response = yield* client.get(`https://public.api.bsky.app/xrpc/app.bsky.graph.getList?list=${at}`);
        const json = yield* HttpClientResponse.schemaBodyJson(BlueskyListsSchema)(response);
        if (json.list.purpose !== "moderation") return undefined;
        return { clearsky: list, bluesky: json.list };
    });

const getBlueskyLists = (lists: typeof ClearskyListsSchema.Type.data.lists) =>
    Effect.gen(function*() {
        const [errors, resultsOrUndefined] = yield* Effect.partition(lists, getBlueskyList);
        const results = resultsOrUndefined.filter((list) => list !== undefined);
        return { errors, results };
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
// const doWork = (handle: string) =>
//     Effect.gen(function*() {
//         const client = yield* HttpClient.HttpClient;
//         const clearskyResponse = yield* client.get(`https://api.clearsky.services/api/v1/anon/get-list/${handle}`);
//         const clearskyJson = yield* HttpClientResponse.schemaBodyJson(ClearskyListsSchema)(clearskyResponse);
//         const clearskyLists = clearskyJson.data.lists;

//     });

const Page: Component = () => {
    const navigate = useNavigate();
    const params = useParams<{ handle?: string | undefined; }>();
    const [clearskyLists] = createResource(() => params.handle || undefined, fetchClearskyLists);
    const [blueskyLists] = createResource(
        () => clearskyLists.state === "ready" ? clearskyLists() : undefined,
        fetchBlueskyLists,
    );

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
                <Match when={clearskyLists.loading}>
                    <p>Fetching lists from Clearsky...</p>
                </Match>
                <Match when={clearskyLists.error}>
                    <span>Error: {`${clearskyLists.error}`}</span>
                </Match>
                {
                    /* <Match when={lists()}>
                    <ul>
                        <For each={lists()}>
                            {(list) => (
                                <li>
                                    <a href={list.url}>{list.name}</a>
                                    <p>{list.description}</p>
                                </li>
                            )}
                        </For>
                    </ul>
                </Match> */
                }
            </Switch>

            <Switch>
                <Match when={blueskyLists.loading}>
                    <p>Loading user info from Bluesky...</p>
                </Match>
                <Match when={blueskyLists.error}>
                    <span>Error: {`${blueskyLists.error}`}</span>
                </Match>
                <Match when={blueskyLists()}>
                    <p>{blueskyLists()?.length} users</p>
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
