/**
 * Adapt the cloud-sdk `RealtimeChannel` constructor into a vendor-agnostic
 * {@link RealtimeConnector} for the hooks. Inject the constructor so this stays
 * decoupled from the SDK:
 *
 * ```ts
 * import { RealtimeChannel } from "@voyant-travel/cloud-sdk"
 * const connector = createRealtimeChannelConnector(RealtimeChannel, { baseUrl })
 * ```
 *
 * Presence is tracked incrementally from `enter`/`update`/`leave` events into a
 * member list; subscribers that need the full set on connect should seed it
 * from `client.realtime.presence.get(channel)`.
 */
export function createRealtimeChannelConnector(RealtimeChannelCtor, options = {}) {
    return {
        subscribe({ channel, token, sinceId, profile, onMessage, onPresence }) {
            const channelClient = new RealtimeChannelCtor({
                channel,
                token,
                ...(sinceId !== undefined ? { sinceId } : {}),
                ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
            });
            const teardown = [];
            if (onMessage) {
                teardown.push(channelClient.on("message", (message) => onMessage({ event: message.event, data: message.data })));
            }
            if (onPresence) {
                const members = new Map();
                teardown.push(channelClient.on("presence", (event) => {
                    if (event.action === "leave") {
                        members.delete(event.clientId);
                    }
                    else {
                        members.set(event.clientId, { clientId: event.clientId, profile: event.data });
                    }
                    onPresence([...members.values()]);
                }));
            }
            if (profile !== undefined) {
                channelClient.enterPresence(profile);
            }
            return {
                unsubscribe() {
                    for (const off of teardown)
                        off();
                    channelClient.close();
                },
            };
        },
    };
}
