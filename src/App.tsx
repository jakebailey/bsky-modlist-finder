import * as v from "@badrap/valita";
import { HashRouter, Route, useLocation, useNavigate, useParams } from "@solidjs/router";
import { type Component, createResource, createSignal, Match, Show, Switch } from "solid-js";

const Response = v.object({
    data: v.object({
        lists: v.array(v.object({
            created_at: v.string(),
            did: v.string(),
            url: v.string(),
            name: v.string(),
            description: v.string(),
        })),
    }),
});

const fetchLists = async (handle: string) => {
    const response = await fetch(`https://api.clearsky.services/api/v1/anon/get-list/${encodeURIComponent(handle)}`);
    const json = await response.json();
    return Response.parse(json, { mode: "strip" });
};

const Page: Component = () => {
    const navigate = useNavigate();
    const params = useParams<{ handle?: string | undefined; }>();

    return (
        <div>
            <input
                placeholder="Enter handle"
                onInput={(e) => navigate("/" + e.currentTarget.value)}
            />
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

    // const [handle, setHandle] = createSignal<string | undefined>();
    // const [lists] = createResource(handle, fetchLists);

    // return (
    //     <div>
    //         <input
    //             placeholder="Enter handle"
    //             onInput={(e) => setHandle(e.currentTarget.value)}
    //         />
    //         <Show when={lists.loading}>
    //             <p>Loading...</p>
    //         </Show>
    //         <Switch>
    //             <Match when={lists.error}>
    //                 <span>Error: {JSON.stringify()}</span>
    //             </Match>
    //             <Match when={lists()}>
    //                 <div>{JSON.stringify(lists())}</div>
    //             </Match>
    //         </Switch>
    //     </div>
    // );
};

export default App;
