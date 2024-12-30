import { HttpClient, HttpClientResponse, HttpIncomingMessage } from "@effect/platform";
import { Data, Effect, Schema } from "effect";

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

const decodeClearskyListsSchema = HttpClientResponse.schemaBodyJson(ClearskyListsSchema);

export const getClearskyLists = (handle: string) =>
    Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient;
        const u = `https://api.clearsky.services/api/v1/anon/get-list/${handle}`;
        yield* Effect.logDebug(`Fetching ${u}`);
        const response = yield* client.get(u);
        const lists = yield* decodeClearskyListsSchema(response);

        yield* Effect.logDebug(`Got ${lists.data.lists.length} lists`);

        const seen = new Set<string>();
        return lists.data.lists.filter((list) => {
            if (seen.has(list.url)) return false;
            seen.add(list.url);
            return true;
        });
    });

const BlueskyErrorSchema = Schema.Struct({
    error: Schema.String,
    message: Schema.String,
});

class BlueskyError extends Data.TaggedError("BlueskyError")<typeof BlueskyErrorSchema.Type> {}

const decodeBlueskyResponse = <A, I, R, E>(
    schema: Schema.Schema<A, I, R>,
) =>
<E>(response: HttpIncomingMessage.HttpIncomingMessage<E>) =>
    Effect.gen(function*() {
        const s = Schema.Union(BlueskyErrorSchema, schema);
        const json = yield* HttpClientResponse.schemaBodyJson(s)(response);
        if (typeof json === "object" && json !== null && "error" in json) {
            yield* new BlueskyError(json);
        }
        return json as A;
    });

const BlueskyListsSchema = Schema.Struct({
    list: Schema.Struct({
        purpose: Schema.String,
    }),
});

const decodeBlueskyListsSchema = decodeBlueskyResponse(BlueskyListsSchema);

export const getBlueskyList = (did: string, url: string) =>
    Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient;
        const id = url.split("/").at(-1);
        const at = `at://${did}/app.bsky.lists/${id}`;
        const u = `https://public.api.bsky.app/xrpc/app.bsky.graph.getList?list=${at}`;
        yield* Effect.logDebug(`Fetching ${u}`);
        const response = yield* client.get(u);
        const json = yield* decodeBlueskyListsSchema(response);
        return json.list;
    });

const BlueskyProfileSchema = Schema.Struct({
    did: Schema.String,
    handle: Schema.String,
    displayName: Schema.String,
    avatar: Schema.String,
    createdAt: Schema.String,
    description: Schema.NullishOr(Schema.String),
    followersCount: Schema.Number,
    followsCount: Schema.Number,
    postsCount: Schema.Number,
});

const decodeBlueskyProfileSchema = decodeBlueskyResponse(BlueskyProfileSchema);

const BlueskyProfilesSchema = Schema.Struct({
    profiles: Schema.Array(BlueskyProfileSchema),
});

const decodeBlueskyProfilesSchema = decodeBlueskyResponse(BlueskyProfilesSchema);

function chunked<A>(array: A[], size: number): A[][] {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

export const getBlueskyProfiles = (handles: string[]) =>
    Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient;

        const map = new Map<string, typeof BlueskyProfileSchema.Type>();
        for (const chunk of chunked(handles, 25)) {
            const params = chunk.map((handle) => `actors=${handle}`).join("&");
            const u = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${params}`;
            yield* Effect.logDebug(`Fetching ${u}`);
            const response = yield* client.get(u);
            const json = yield* decodeBlueskyProfilesSchema(response);
            for (const profile of json.profiles) {
                map.set(profile.handle, profile);
                map.set(profile.did, profile);
            }
        }

        return map;
    });

export const getBlueskyProfile = (handle: string) =>
    Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient;
        const u = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${handle}`;
        yield* Effect.logDebug(`Fetching ${u}`);
        const response = yield* client.get(u);
        const json = yield* decodeBlueskyProfileSchema(response);
        return json;
    });
