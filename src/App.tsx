import "water.css";
import "./App.css";

import * as v from "@badrap/valita";
import { HashRouter, Route, useNavigate, useParams } from "@solidjs/router";
import { type Component, createResource, For, Match, Show, Switch } from "solid-js";

const Response = v.object({
    data: v.object({
        lists: v.array(v.object({
            created_at: v.string().nullable().optional(),
            did: v.string(),
            url: v.string(),
            name: v.string(),
            description: v.string().nullable().optional(),
        })),
    }),
});

const fetchLists = async (handle: string) => {
    const response = await fetch(`https://api.clearsky.services/api/v1/anon/get-list/${handle}`);
    const json = await response.json();
    try {
        const parsed = Response.parse(json, { mode: "strip" });
        return parsed.data.lists;
    } catch (e) {
        console.error(json);
        throw e;
    }
};

const Page: Component = () => {
    const navigate = useNavigate();
    const params = useParams<{ handle?: string | undefined; }>();
    const [lists] = createResource(() => params.handle || undefined, fetchLists, { initialValue: [] });

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
                <Match when={lists.loading}>
                    <p>Loading...</p>
                </Match>
                <Match when={lists.error}>
                    <span>Error: {`${lists.error}`}</span>
                </Match>
                <Match when={lists()}>
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
