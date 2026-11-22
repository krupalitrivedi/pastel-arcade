/* tslint:disable */
/* eslint-disable */
/**
 * The folder an account's files live in, under the origin's OPFS root: the
 * namespace every binding derives for one application id and profile, so
 * two profiles never share a log.
 */
export function storageNamespace(app_id: string, profile: string): string;
/**
 * A fresh room code for signalling through Nostr (W11): eighty bits, in
 * letters and digits a person can read out.
 */
export function signalNewRoom(): string;
/**
 * The relay `REQ` text that receives `room`'s signalling.
 *
 * It asks from as far back as [`signal::open`] accepts an event, so a peer
 * whose clock runs behind this one by anything inside that window is
 * forwarded and then accepted, rather than filtered out by the relay first.
 */
export function signalSubscription(room: string, subscription_id: string): string;
/**
 * The relay `EVENT` text carrying one connection code for `room`, sealed
 * under the room key and signed by a key used once. `role` is "offer" or
 * "answer"; `session` is the joiner's 32 hex characters.
 */
export function signalEvent(room: string, role: string, session: string, code: string): string;
/**
 * Opens one message a relay sent: `{role, session, code, freshUntilMs}` as
 * JSON when it is an authentic, fresh signal for `room`, otherwise
 * `undefined`. `freshUntilMs` is when this clock stops accepting the event
 * ([`signal::Opened::fresh_until`]).
 */
export function signalOpen(room: string, relay_message: string): string | undefined;
/**
 * Opens an invite someone shared: `{address, publicKey, petname, signed}` as
 * JSON, the address already checked to derive from the key. Refuses a
 * malformed blob, an address that is not the key's, and a signature that
 * does not verify; each means the invite must not be shown at all.
 */
export function parseInvite(blob: string): string;
/**
 * This application's App tag (8 bytes), which a central compares when a
 * peripheral presents one instance of the service per SDK application.
 */
export function bleAppTag(app_id: string): Uint8Array;
/**
 * One fragment for the page to write to a peripheral's Message
 * characteristic.
 */
export class BleFragment {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * The fragment, written as one value.
   */
  readonly data: Uint8Array;
  /**
   * The address whose link it goes on.
   */
  readonly peer: string;
}
/**
 * One device's place in a nearby room (W13): the room behind one network
 * address for one application, and the key this device announces there.
 */
export class NearbyRoomKeys {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * The `REQ` text receiving the room, from as far back as an event is
   * accepted.
   */
  subscription(subscription_id: string): string;
  /**
   * Joins the room for `app_id` behind `network` (the address a STUN
   * server reports: IPv4, or IPv6 taken to its /64), under `label`.
   */
  constructor(app_id: string, network: string, label: string);
  /**
   * Opens a relay message: `{kind, peer, label, session, code,
   * createdAtMs, freshUntilMs}` as JSON for a presence from another
   * device or an offer or answer sealed to this one, else `undefined`.
   */
  open(relay_message: string): string | undefined;
  /**
   * The `EVENT` text offering `code` to the device that announced `to`.
   */
  offer(to: string, session: string, code: string): string;
  /**
   * The `EVENT` text answering the joiner whose presence key is `to`.
   */
  answer(to: string, session: string, code: string): string;
  /**
   * The `EVENT` text announcing this device.
   */
  presence(): string;
  /**
   * The key this device announces.
   */
  readonly key: string;
}
/**
 * One frame for the page to put on the carrier it opened for `link`.
 */
export class OutboundFrame {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * The framed bytes, sent as one carrier message.
   */
  readonly data: Uint8Array;
  /**
   * The carrier this frame goes on.
   */
  readonly link: number;
}
/**
 * The Offline Protocol engine, one per worker.
 */
export class WebEngine {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Checks a peripheral's Device id and Identity values; returns the
   * address the identity proves, which must equal the Device id.
   */
  bleVerify(device_id: Uint8Array, identity: Uint8Array): string;
  /**
   * A carrier closed.
   */
  closeLink(link: number): void;
  /**
   * A group's members and epoch as JSON, or nothing for a group this
   * device does not hold.
   */
  groupInfo(group_id: string): string | undefined;
  /**
   * Mints a new identity held in memory and returns its `off1…` address.
   * The identity ends with the worker.
   */
  initialize(): string;
  /**
   * The next event as the engine's JSON, or `undefined`.
   */
  pollEvent(): string | undefined;
  /**
   * A verified peripheral's link is subscribed and has said hello; its
   * write payload is `maxPayload` bytes.
   */
  bleLinkUp(peer: string, max_payload: number): void;
  /**
   * The next link the engine closed on its own (a preamble that never
   * came), or `undefined`. The page closes that carrier and tells the
   * other end, as for a link `linkReceived` refused.
   */
  nextClosed(): number | undefined;
  /**
   * What the durable logs have cost since they opened, as JSON
   * (`{"mls": {...}, "protocol_state": {...}}`), or `undefined` for an
   * engine held in memory.
   */
  storeStats(): string | undefined;
  /**
   * Creates a group; returns its info as JSON.
   */
  createGroup(name: string): string;
  /**
   * Sends a direct message; returns its id. `ephemeral` sends it once
   * over the live link, never acknowledged or retried (W10).
   */
  sendMessage(recipient: string, content: string, ephemeral: boolean): string;
  /**
   * A stopped engine with the slots the application turned on. `nostr`
   * adds the Nostr slot (W12), which the worker drives over relays the
   * application named: `coldContact` publishes key packages and resolves
   * peers', `usernameDiscovery` publishes `profile` as a username and
   * resolves others'. `ble` adds the Bluetooth LE slot (W14), driven from
   * the page over Web Bluetooth.
   */
  static withOptions(app_id: string, profile: string, nostr: boolean, cold_contact: boolean, username_discovery: boolean, ble: boolean): WebEngine;
  /**
   * The link to `peer` is gone.
   */
  bleLinkDown(peer: string): void;
  /**
   * An invite for this device, base64url, optionally with a petname and
   * a signature binding it.
   */
  createInvite(petname: string | null | undefined, sign: boolean): string;
  /**
   * Bytes a carrier delivered. Returns the reason to close it, or
   * `undefined` to keep it open.
   */
  linkReceived(link: number, bytes: Uint8Array): string | undefined;
  /**
   * This device's address, once initialized.
   */
  localAddress(): string | undefined;
  /**
   * The next frame to send, or `undefined`.
   */
  nextOutbound(): OutboundFrame | undefined;
  /**
   * Adds a member to a group this device administers.
   */
  inviteToGroup(group_id: string, member: string): void;
  /**
   * The next event to publish as `{messageId, eventId, eventJson}` JSON,
   * or `undefined`. Nothing while no relay is live.
   */
  nostrNextEvent(): string | undefined;
  /**
   * The next resolution query as `{queryId, reqJson}` JSON, or
   * `undefined`. Sent to every live relay under `queryId`.
   */
  nostrNextQuery(): string | undefined;
  /**
   * Registers a service; `capabilities_json` is a JSON object of strings.
   */
  registerService(service_id: string, version: string, capabilities_json: string): void;
  /**
   * Resolves a username; exactly one `username_resolved` event follows.
   */
  resolveUsername(username: string): boolean;
  /**
   * The next fragment to write, or `undefined`.
   */
  bleNextFragment(): BleFragment | undefined;
  /**
   * One `EVENT` message a relay sent, whole.
   */
  nostrRelayEvent(relay_message: string): void;
  /**
   * No relay took the event carrying `messageId`.
   */
  nostrSendFailed(message_id: string, reason?: string | null): void;
  /**
   * Removes a member from a group this device administers.
   */
  removeFromGroup(group_id: string, member: string): void;
  /**
   * Subscribes to a provider's topic or topic pattern; returns the
   * subscription id. `keys_json` is a JSON array of `latest` keys (each
   * exact or a prefix ending in `*`); `[]` for every key.
   */
  subscribeService(provider: string, service_id: string, topic: string, mode: string, params: string, keys_json: string): string;
  /**
   * Opens the account's sealed logs, loads its identity (minting it on the
   * first run), and returns its `off1…` address.
   *
   * `store_key` is the 32-byte key the worker unwrapped; the four handles
   * are the MLS log's two files and the protocol-state log's two. Refuses,
   * and changes nothing, when a log holds records this key does not open.
   */
  initializeDurable(store_key: Uint8Array, mls_first: FileSystemSyncAccessHandle, mls_second: FileSystemSyncAccessHandle, state_first: FileSystemSyncAccessHandle, state_second: FileSystemSyncAccessHandle): string;
  /**
   * A relay accepted the event carrying `messageId`.
   */
  nostrConfirmSent(message_id: string): void;
  /**
   * The `REQ` text that receives this device's messages (W12). Sent on
   * every relay connect.
   */
  nostrSubscription(subscription_id: string): string;
  /**
   * Sends to a group; returns the per-member message ids as JSON.
   * `ephemeral` as for [`WebEngine::send_message`].
   */
  sendGroupMessage(group_id: string, content: string, ephemeral: boolean): string;
  /**
   * Unregisters a service; `false` when it was not registered.
   */
  unregisterService(service_id: string): boolean;
  /**
   * Starts a topic over.
   */
  clearServiceTopic(service_id: string, topic: string): void;
  /**
   * Registers a carrier opened toward `address`, a dial code's claim
   * (W16): a link whose preamble proves anyone else closes with nothing
   * announced. Refuses an address that is not canonical.
   */
  openLinkExpecting(address: string): number;
  /**
   * The subscriptions other devices hold here, as JSON.
   */
  serviceSubscribers(service_id?: string | null): string;
  /**
   * Ends a subscription this device holds.
   */
  unsubscribeService(sub_id: string): boolean;
  /**
   * The worker has a live relay, or none.
   */
  nostrStatusChanged(live: boolean): void;
  /**
   * One fragment a peripheral notified on `peer`'s link.
   */
  bleFragmentReceived(peer: string, fragment: Uint8Array): void;
  /**
   * Every relay the query went to has answered, or the worker stopped
   * waiting.
   */
  nostrQueryCompleted(query_id: string): void;
  /**
   * The subscriptions this device holds, as JSON.
   */
  serviceSubscriptions(): string;
  /**
   * Publishes to a topic; returns the report as JSON.
   */
  publishServiceUpdate(service_id: string, topic: string, key: string | null | undefined, body: string): string;
  /**
   * Ends a subscription another device holds on this one.
   */
  endServiceSubscription(sub_id: string, reason: string): void;
  /**
   * Starts a session with a peer: "created" when this call sent the
   * Welcome, "existing" when one already exists, "pending" while the
   * peer's key package has not arrived (a node with Nostr has asked the
   * relays for it).
   */
  establishSecureSession(peer: string): string;
  /**
   * Accepts a subscriber the application was asked about.
   */
  acceptServiceSubscription(sub_id: string): void;
  /**
   * Rejects a subscriber the application was asked about.
   */
  rejectServiceSubscription(sub_id: string, reason: string): void;
  /**
   * Asks a subscription's provider for the whole state again.
   */
  resyncServiceSubscription(sub_id: string): void;
  /**
   * Sets a `log` topic's checkpoint.
   */
  setServiceTopicCheckpoint(service_id: string, topic: string, body: string): void;
  /**
   * Sets a service's admission policy from JSON.
   */
  setServiceSubscriptionPolicy(service_id: string, policy_json: string): void;
  /**
   * A stopped engine. `profile` names the local account; it is not the
   * identity, which [`WebEngine::initialize`] mints.
   */
  constructor(app_id: string, profile: string);
  /**
   * Stops the engine, reporting every link lost first.
   */
  stop(): void;
  /**
   * Starts the engine.
   */
  start(): void;
  /**
   * One tick. Call every 100 ms.
   */
  process(): void;
  /**
   * This device's identity assertion, which the page writes to a
   * peripheral's Hello characteristic (W14).
   */
  bleHello(): Uint8Array;
  /**
   * Registers a carrier the page opened; returns its link id.
   */
  openLink(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_blefragment_free: (a: number, b: number) => void;
  readonly __wbg_nearbyroomkeys_free: (a: number, b: number) => void;
  readonly __wbg_outboundframe_free: (a: number, b: number) => void;
  readonly __wbg_webengine_free: (a: number, b: number) => void;
  readonly bleAppTag: (a: number, b: number, c: number) => void;
  readonly blefragment_data: (a: number, b: number) => void;
  readonly blefragment_peer: (a: number, b: number) => void;
  readonly nearbyroomkeys_answer: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly nearbyroomkeys_key: (a: number, b: number) => void;
  readonly nearbyroomkeys_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly nearbyroomkeys_offer: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly nearbyroomkeys_open: (a: number, b: number, c: number, d: number) => void;
  readonly nearbyroomkeys_presence: (a: number, b: number) => void;
  readonly nearbyroomkeys_subscription: (a: number, b: number, c: number, d: number) => void;
  readonly outboundframe_data: (a: number, b: number) => void;
  readonly outboundframe_link: (a: number) => number;
  readonly parseInvite: (a: number, b: number, c: number) => void;
  readonly signalEvent: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
  readonly signalNewRoom: (a: number) => void;
  readonly signalOpen: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly signalSubscription: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly storageNamespace: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly webengine_acceptServiceSubscription: (a: number, b: number, c: number, d: number) => void;
  readonly webengine_bleFragmentReceived: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly webengine_bleHello: (a: number, b: number) => void;
  readonly webengine_bleLinkDown: (a: number, b: number, c: number) => void;
  readonly webengine_bleLinkUp: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly webengine_bleNextFragment: (a: number) => number;
  readonly webengine_bleVerify: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly webengine_clearServiceTopic: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly webengine_closeLink: (a: number, b: number) => void;
  readonly webengine_createGroup: (a: number, b: number, c: number, d: number) => void;
  readonly webengine_createInvite: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly webengine_endServiceSubscription: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly webengine_establishSecureSession: (a: number, b: number, c: number, d: number) => void;
  readonly webengine_groupInfo: (a: number, b: number, c: number, d: number) => void;
  readonly webengine_initialize: (a: number, b: number) => void;
  readonly webengine_initializeDurable: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly webengine_inviteToGroup: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly webengine_linkReceived: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly webengine_localAddress: (a: number, b: number) => void;
  readonly webengine_new: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly webengine_nextClosed: (a: number) => number;
  readonly webengine_nextOutbound: (a: number) => number;
  readonly webengine_nostrConfirmSent: (a: number, b: number, c: number) => void;
  readonly webengine_nostrNextEvent: (a: number, b: number) => void;
  readonly webengine_nostrNextQuery: (a: number, b: number) => void;
  readonly webengine_nostrQueryCompleted: (a: number, b: number, c: number) => void;
  readonly webengine_nostrRelayEvent: (a: number, b: number, c: number, d: number) => void;
  readonly webengine_nostrSendFailed: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly webengine_nostrStatusChanged: (a: number, b: number, c: number) => void;
  readonly webengine_nostrSubscription: (a: number, b: number, c: number, d: number) => void;
  readonly webengine_openLink: (a: number, b: number) => void;
  readonly webengine_openLinkExpecting: (a: number, b: number, c: number, d: number) => void;
  readonly webengine_pollEvent: (a: number, b: number) => void;
  readonly webengine_process: (a: number, b: number) => void;
  readonly webengine_publishServiceUpdate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
  readonly webengine_registerService: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly webengine_rejectServiceSubscription: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly webengine_removeFromGroup: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly webengine_resolveUsername: (a: number, b: number, c: number, d: number) => void;
  readonly webengine_resyncServiceSubscription: (a: number, b: number, c: number, d: number) => void;
  readonly webengine_sendGroupMessage: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly webengine_sendMessage: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly webengine_serviceSubscribers: (a: number, b: number, c: number, d: number) => void;
  readonly webengine_serviceSubscriptions: (a: number, b: number) => void;
  readonly webengine_setServiceSubscriptionPolicy: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly webengine_setServiceTopicCheckpoint: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly webengine_start: (a: number, b: number) => void;
  readonly webengine_stop: (a: number, b: number) => void;
  readonly webengine_storeStats: (a: number, b: number) => void;
  readonly webengine_subscribeService: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => void;
  readonly webengine_unregisterService: (a: number, b: number, c: number, d: number) => void;
  readonly webengine_unsubscribeService: (a: number, b: number, c: number, d: number) => void;
  readonly webengine_withOptions: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
  readonly __wbindgen_export: (a: number, b: number) => number;
  readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export3: (a: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
