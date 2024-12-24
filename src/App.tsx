import "water.css";
import "./App.css";

import * as v from "@badrap/valita";
import { HashRouter, Route, useNavigate, useParams } from "@solidjs/router";
import { type Component, createResource, For, Match, Show, Switch } from "solid-js";

const ClearskyListsResponse = v.object({
    data: v.object({
        lists: v.array(v.object({
            created_date: v.string(), // .nullable().optional(),
            did: v.string(),
            url: v.string(),
            name: v.string(),
            description: v.string().nullable().optional(),
        })),
    }),
});

const fetchClearskyLists = async (handle: string) => {
    const response = await fetch(`https://api.clearsky.services/api/v1/anon/get-list/${handle}`);
    const json = await response.json();
    try {
        const parsed = ClearskyListsResponse.parse(json, { mode: "strip" });
        return parsed.data.lists;
    } catch (e) {
        console.error(json);
        throw e;
    }
};

const BlueskyListResponse = v.object({
    list: v.object({
        purpose: v.string(),
    }),
});

const fetchBlueskyLists = async (lists: Awaited<ReturnType<typeof fetchClearskyLists>>) => {
    const result = [];
    for (const list of lists) {
        const start = list.url.lastIndexOf("/") + 1;
        const id = list.url.slice(start);
        const at = `at://${list.did}/app.bsky.lists/${id}`;
        const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.graph.getList?list=${at}`);
        const json = await response.json();
        try {
            const parsed = BlueskyListResponse.parse(json, { mode: "strip" });
            if (parsed.list.purpose === "moderation") {
                result.push(list);
            }
        } catch (e) {
            console.error(json);
            throw e;
        }
    }
    return result;
};

const BlueskyProfileResponse = v.object({
    did: v.string(),
    handle: v.string(),
    followersCount: v.number(),
});

const fetchBlueskyProfile = async (handle: string) => {
    const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${handle}`);
    const json = await response.json();
    try {
        const parsed = BlueskyProfileResponse.parse(json, { mode: "strip" });
        return parsed;
    } catch (e) {
        console.error(json);
        throw e;
    }
};

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
