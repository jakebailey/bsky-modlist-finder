import "water.css";
import "./App.css";

import * as v from "@badrap/valita";
import { HashRouter, Route, useNavigate, useParams } from "@solidjs/router";
import { type Component, createResource, Match, Show, Switch } from "solid-js";

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
    const response = await fetch(`https://api.clearsky.services/api/v1/anon/get-list/${encodeURIComponent(handle)}`);
    const json = await response.json();
    try {
        return Response.parse(json, { mode: "strip" });
    } catch (e) {
        console.error(json);
        throw e;
    }
};

const Page: Component = () => {
    const navigate = useNavigate();
    const params = useParams<{ handle?: string | undefined; }>();
    const [lists] = createResource(params.handle || undefined, fetchLists);

    return (
        <div>
            <h1>Bluesky Moderation List Finder</h1>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    navigate(`/${(e.currentTarget.handle as HTMLInputElement).value}`);
                }}
            >
                <input id="handle" placeholder="Enter handle" />
                <button type="submit">Submit</button>
            </form>
            <Show when={lists.loading}>
                <p>Loading...</p>
            </Show>
            <Switch>
                <Match when={lists.error}>
                    <span>Error: {`${lists.error}`}</span>
                </Match>
                <Match when={lists()}>
                    <div>{JSON.stringify(lists())}</div>
                </Match>
            </Switch>
            <p>hello {params.handle}</p>
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
