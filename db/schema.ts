import { sqliteTable, text, integer, index, unique, check, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    authId: text("authId").notNull().unique(),
    role: text("role").notNull(),
    active: integer("active").notNull().default(1),
    createdAt: text("createdAt").notNull(),
  },
  (t) => [check("users_role_valid", sql`role IN ('owner','moderator','member')`)],
);
export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    token: text("token").notNull().unique(),
    expires: integer("expires").notNull(),
    used: integer("used").notNull().default(0),
    createdBy: text("createdBy").references(() => users.id),
  },
  (t) => [check("invites_role_valid", sql`role IN ('moderator','member')`)],
);
export const people = sqliteTable(
  "people",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nickname: text("nickname").notNull().default(""),
    birthPlace: text("birthPlace").notNull().default(""),
    birthDate: text("birthDate"),
    deathDate: text("deathDate"),
    place: text("place"),
    country: text("country"),
    biography: text("biography"),
    source: text("source"),
    createdBy: text("createdBy").references(() => users.id),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
    deletedAt: text("deletedAt"),
  },
  (t) => [index("people_name").on(t.name), index("people_birth").on(t.birthDate)],
);
export const relations = sqliteTable(
  "relations",
  {
    id: text("id").primaryKey(),
    personA: text("personA").references(() => people.id),
    personB: text("personB").references(() => people.id),
    type: text("type"),
    date: text("date"),
  },
  (t) => [
    check("relations_type_valid", sql`type IN ('parent','spouse','adoptive')`),
    unique().on(t.personA, t.personB, t.type),
    check("relations_valid", sql`personA != personB`),
    index("relations_b").on(t.personB),
  ],
);
export const photos = sqliteTable(
  "photos",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    date: text("date"),
    place: text("place"),
    description: text("description"),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    createdBy: text("createdBy").references(() => users.id),
    status: text("status").notNull(),
    createdAt: text("createdAt").notNull(),
    deletedAt: text("deletedAt"),
  },
  (t) => [check("photos_status_valid", sql`status IN ('pending','approved','rejected')`), index("photos_status").on(t.status, t.createdAt)],
);
export const photo_people = sqliteTable(
  "photo_people",
  { photoId: text("photoId").references(() => photos.id, { onDelete: "cascade" }), personId: text("personId").references(() => people.id) },
  (t) => [primaryKey({ columns: [t.photoId, t.personId] })],
);
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    type: text("type").notNull(),
    date: text("date").notNull(),
    place: text("place"),
    description: text("description"),
    personId: text("personId").references(() => people.id),
    createdBy: text("createdBy").references(() => users.id),
    status: text("status").notNull(),
    createdAt: text("createdAt").notNull(),
    deletedAt: text("deletedAt"),
  },
  (t) => [
    check("events_type_valid", sql`type IN ('gathering','birthday','marriage','memorial','funeral','migration','story')`),
    check("events_status_valid", sql`status IN ('pending','approved','rejected')`),
    index("events_date").on(t.date, t.status),
  ],
);
export const audit = sqliteTable("audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("userId"),
  action: text("action").notNull(),
  entityId: text("entityId"),
  createdAt: text("createdAt").notNull(),
});
export const settings = sqliteTable("settings", { key: text("key").primaryKey(), value: text("value").notNull() });
export const throttle = sqliteTable("throttle", { key: text("key").primaryKey(), count: integer("count").notNull(), expires: integer("expires").notNull() });
export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    senderId: text("senderId")
      .notNull()
      .references(() => users.id),
    recipientId: text("recipientId")
      .notNull()
      .references(() => users.id),
    clientId: text("clientId").notNull(),
    body: text("body").notNull(),
    createdAt: text("createdAt").notNull(),
    readAt: text("readAt"),
  },
  (t) => [
    unique().on(t.senderId, t.clientId),
    index("messages_thread").on(t.senderId, t.recipientId, t.id),
    index("messages_inbox").on(t.recipientId, t.readAt),
  ],
);
export const blocks = sqliteTable(
  "blocks",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id),
    blockedId: text("blockedId")
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.blockedId] })],
);
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  messageId: integer("messageId")
    .notNull()
    .references(() => messages.id),
  reporterId: text("reporterId")
    .notNull()
    .references(() => users.id),
  reason: text("reason").notNull(),
  createdAt: text("createdAt").notNull(),
  resolved: integer("resolved").notNull().default(0),
});
export const location_shares = sqliteTable("location_shares", {
  userId: text("userId")
    .primaryKey()
    .references(() => users.id),
  latitude: text("latitude"),
  longitude: text("longitude"),
  accuracy: integer("accuracy"),
  precision: text("precision").notNull(),
  consentedAt: text("consentedAt").notNull(),
  updatedAt: text("updatedAt"),
  expires: integer("expires").notNull(),
  shareToken: text("shareToken").notNull(),
});
export const residences = sqliteTable("residences", {
  personId: text("personId")
    .primaryKey()
    .references(() => people.id),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  label: text("label").notNull(),
  updatedAt: text("updatedAt").notNull(),
});
export const attendance = sqliteTable(
  "attendance",
  {
    eventId: text("eventId")
      .notNull()
      .references(() => events.id),
    userId: text("userId")
      .notNull()
      .references(() => users.id),
    response: text("response").notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  filename: text("filename").notNull(),
  createdBy: text("createdBy")
    .notNull()
    .references(() => users.id),
  createdAt: text("createdAt").notNull(),
  status: text("status").notNull(),
  deletedAt: text("deletedAt"),
});

export const archive_entries = sqliteTable(
  "archive_entries",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    personId: text("personId").references(() => people.id),
    photoId: text("photoId").references(() => photos.id),
    eventId: text("eventId").references(() => events.id),
    data: text("data").notNull().default("{}"),
    visibility: text("visibility").notNull().default("family"),
    status: text("status").notNull(),
    opensAt: text("opensAt"),
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
    deletedAt: text("deletedAt"),
  },
  (t) => [index("archive_kind_status").on(t.kind, t.status, t.createdAt), index("archive_person").on(t.personId), index("archive_author").on(t.createdBy)],
);
export const archive_comments = sqliteTable(
  "archive_comments",
  {
    id: text("id").primaryKey(),
    entryId: text("entryId")
      .notNull()
      .references(() => archive_entries.id),
    body: text("body").notNull(),
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id),
    createdAt: text("createdAt").notNull(),
    status: text("status").notNull(),
  },
  (t) => [index("archive_comments_entry").on(t.entryId, t.createdAt)],
);
export const archive_votes = sqliteTable(
  "archive_votes",
  {
    entryId: text("entryId")
      .notNull()
      .references(() => archive_entries.id),
    userId: text("userId")
      .notNull()
      .references(() => users.id),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.userId] })],
);
export const archive_media = sqliteTable(
  "archive_media",
  {
    id: text("id").primaryKey(),
    entryId: text("entryId")
      .notNull()
      .references(() => archive_entries.id),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id),
    createdAt: text("createdAt").notNull(),
  },
  (t) => [index("archive_media_entry").on(t.entryId)],
);
export const family_groups = sqliteTable("family_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdBy: text("createdBy")
    .notNull()
    .references(() => users.id),
  createdAt: text("createdAt").notNull(),
});
export const group_members = sqliteTable(
  "group_members",
  {
    groupId: text("groupId")
      .notNull()
      .references(() => family_groups.id),
    userId: text("userId")
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);
export const group_messages = sqliteTable(
  "group_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: text("groupId")
      .notNull()
      .references(() => family_groups.id),
    userId: text("userId")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: text("createdAt").notNull(),
  },
  (t) => [index("group_messages_group").on(t.groupId, t.id)],
);
export const person_merges = sqliteTable("person_merges", {
  id: text("id").primaryKey(),
  sourceId: text("sourceId").notNull(),
  targetId: text("targetId").notNull(),
  snapshot: text("snapshot").notNull(),
  createdBy: text("createdBy").notNull(),
  createdAt: text("createdAt").notNull(),
  undoneAt: text("undoneAt"),
});
export const photo_privacy = sqliteTable("photo_privacy", {
  photoId: text("photoId")
    .primaryKey()
    .references(() => photos.id),
  visibility: text("visibility").notNull(),
});
export const person_guardians = sqliteTable("person_guardians", {
  personId: text("personId")
    .primaryKey()
    .references(() => people.id),
  userId: text("userId")
    .notNull()
    .references(() => users.id),
});
export const security_factors = sqliteTable("security_factors", {
  userId: text("userId")
    .primaryKey()
    .references(() => users.id),
  secret: text("secret").notNull(),
  enabled: integer("enabled").notNull().default(0),
  lastStep: integer("lastStep").notNull().default(-1),
});
export const security_sessions = sqliteTable(
  "security_sessions",
  {
    token: text("token").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id),
    expires: integer("expires").notNull(),
  },
  (t) => [index("security_sessions_user").on(t.userId, t.expires)],
);
export const archive_backups = sqliteTable("archive_backups", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  createdAt: text("createdAt").notNull(),
  recordCount: integer("recordCount").notNull(),
});
export const security_recovery = sqliteTable(
  "security_recovery",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id),
    digest: text("digest").notNull(),
    createdAt: text("createdAt").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.digest] })],
);
export const push_keys = sqliteTable("push_keys", {
  id: integer("id").primaryKey(),
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey").notNull(),
});
export const push_subscriptions = sqliteTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id),
    createdAt: text("createdAt").notNull(),
  },
  (t) => [index("push_user").on(t.userId)],
);

// search_fts (FTS5), search_catalog and their five source-table triggers are owned by custom migration 0006_search_index.sql. They are derived indexes, not authoritative family records.
export const profile_details = sqliteTable("profile_details", {
  personId: text("personId")
    .primaryKey()
    .references(() => people.id),
  userId: text("userId").references(() => users.id),
  fields: text("fields").notNull().default("{}"),
});
export const content_audience = sqliteTable(
  "content_audience",
  {
    kind: text("kind").notNull(),
    recordId: text("recordId").notNull(),
    mode: text("mode").notNull(),
    userIds: text("userIds").notNull().default("[]"),
    groupId: text("groupId"),
  },
  (t) => [primaryKey({ columns: [t.kind, t.recordId] })],
);
export const chat_attachments = sqliteTable("chat_attachments", {
  id: text("id").primaryKey(),
  senderId: text("senderId")
    .notNull()
    .references(() => users.id),
  kind: text("kind").notNull(),
  targetId: text("targetId").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  createdAt: text("createdAt").notNull(),
});
export const message_extras = sqliteTable(
  "message_extras",
  {
    kind: text("kind").notNull(),
    messageId: integer("messageId").notNull(),
    replyId: integer("replyId"),
    attachmentId: text("attachmentId").references(() => chat_attachments.id),
    clientId: text("clientId"),
    senderId: text("senderId"),
  },
  (t) => [primaryKey({ columns: [t.kind, t.messageId] }), unique().on(t.senderId, t.clientId)],
);
export const chat_typing = sqliteTable(
  "chat_typing",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(),
    targetId: text("targetId").notNull(),
    expires: integer("expires").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.targetId] })],
);
export const feed_posts = sqliteTable(
  "feed_posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id),
    clientId: text("clientId").notNull(),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    date: text("date"),
    place: text("place"),
    peopleIds: text("peopleIds").notNull().default("[]"),
    photoId: text("photoId").references(() => photos.id),
    eventId: text("eventId").references(() => events.id),
    filename: text("filename"),
    mime: text("mime"),
    visibility: text("visibility").notNull().default("family"),
    userIds: text("userIds").notNull().default("[]"),
    groupId: text("groupId"),
    pinned: integer("pinned").notNull().default(0),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
    deletedAt: text("deletedAt"),
  },
  (t) => [unique().on(t.createdBy, t.clientId), index("feed_order").on(t.deletedAt, t.id), index("feed_author").on(t.createdBy, t.id)],
);
export const feed_comments = sqliteTable(
  "feed_comments",
  {
    peopleIds: text("peopleIds").notNull().default("[]"),
    id: integer("id").primaryKey({ autoIncrement: true }),
    postId: integer("postId")
      .notNull()
      .references(() => feed_posts.id),
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id),
    parentId: integer("parentId"),
    body: text("body").notNull(),
    createdAt: text("createdAt").notNull(),
    deletedAt: text("deletedAt"),
  },
  (t) => [index("feed_comment_post").on(t.postId, t.id)],
);
export const feed_reactions = sqliteTable(
  "feed_reactions",
  {
    postId: integer("postId")
      .notNull()
      .references(() => feed_posts.id),
    userId: text("userId")
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);
export const feed_saved = sqliteTable(
  "feed_saved",
  {
    postId: integer("postId")
      .notNull()
      .references(() => feed_posts.id),
    userId: text("userId")
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);
export const feed_notifications = sqliteTable(
  "feed_notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postId: integer("postId")
      .notNull()
      .references(() => feed_posts.id),
    userId: text("userId")
      .notNull()
      .references(() => users.id),
    readAt: text("readAt"),
  },
  (t) => [unique().on(t.postId, t.userId), index("feed_notice_user").on(t.userId, t.id)],
);

export const photo_details = sqliteTable(
  "photo_details",
  {
    photoId: text("photoId")
      .primaryKey()
      .references(() => photos.id),
    datePrecision: text("datePrecision").notNull().default("day"),
    outsiders: text("outsiders").notNull().default(""),
    source: text("source").notNull().default(""),
    photographer: text("photographer").notNull().default(""),
    positions: text("positions").notNull().default("[]"),
    digest: text("digest"),
    albumId: text("albumId"),
    clientId: text("clientId"),
    createdBy: text("createdBy").references(() => users.id),
  },
  (t) => [index("photo_digest").on(t.digest), index("photo_album").on(t.albumId), unique().on(t.createdBy, t.clientId)],
);
export const photo_suggestions = sqliteTable(
  "photo_suggestions",
  {
    id: text("id").primaryKey(),
    photoId: text("photoId")
      .notNull()
      .references(() => photos.id),
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id),
    data: text("data").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: text("createdAt").notNull(),
    reviewedBy: text("reviewedBy"),
    reviewedAt: text("reviewedAt"),
  },
  (t) => [index("suggestion_photo").on(t.photoId, t.status)],
);
export const photo_audio = sqliteTable("photo_audio", {
  photoId: text("photoId")
    .primaryKey()
    .references(() => photos.id),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  transcript: text("transcript").notNull().default(""),
  createdBy: text("createdBy")
    .notNull()
    .references(() => users.id),
});
export const user_preferences = sqliteTable("user_preferences", {
  userId: text("userId")
    .primaryKey()
    .references(() => users.id),
  data: text("data").notNull().default("{}"),
  updatedAt: text("updatedAt").notNull(),
});
export const photo_media = sqliteTable("photo_media", {
  photoId: text("photoId")
    .primaryKey()
    .references(() => photos.id),
  width: integer("width"),
  height: integer("height"),
  focusX: integer("focusX").notNull().default(50),
  focusY: integer("focusY").notNull().default(40),
  updatedAt: text("updatedAt").notNull(),
  // Optimisation of the smaller copies, tracked apart from saving the original.
  // pending → ready, or failed with a retry time; lastError holds no personal data.
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: text("nextAttemptAt"),
  lastError: text("lastError"),
});
export const photo_variants = sqliteTable(
  "photo_variants",
  {
    photoId: text("photoId")
      .notNull()
      .references(() => photos.id),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: text("createdAt").notNull(),
  },
  (t) => [primaryKey({ columns: [t.photoId, t.width] })],
);
export const feed_emoji = sqliteTable(
  "feed_emoji",
  {
    postId: integer("postId")
      .notNull()
      .references(() => feed_posts.id),
    userId: text("userId")
      .notNull()
      .references(() => users.id),
    emoji: text("emoji").notNull(),
    createdAt: text("createdAt").notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);
export const feed_comment_likes = sqliteTable(
  "feed_comment_likes",
  {
    commentId: integer("commentId")
      .notNull()
      .references(() => feed_comments.id),
    userId: text("userId")
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);
export const feed_activity = sqliteTable("feed_activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("postId").notNull(),
  kind: text("kind").notNull(),
  createdAt: text("createdAt").notNull(),
});

// Operational errors from the server jobs and from browsers, for the admin panel.
// Holds only an event name, a short message and the page area; no content or personal data.
export const error_log = sqliteTable(
  "error_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    event: text("event").notNull(),
    message: text("message").notNull(),
    area: text("area"),
    createdAt: text("createdAt").notNull(),
  },
  (t) => [index("error_log_created").on(t.createdAt)],
);
// Outgoing e-mail (invites, password resets). The body holds a one-time link, so it is cleared as
// soon as the message is sent or finally fails; only the status and the error stay.
export const mail_queue = sqliteTable(
  "mail_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    refId: text("refId"),
    toAddr: text("toAddr").notNull(),
    subject: text("subject").notNull(),
    body: text("body"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("nextAttemptAt"),
    lastError: text("lastError"),
    createdAt: text("createdAt").notNull(),
    sentAt: text("sentAt"),
  },
  (t) => [index("mail_queue_due").on(t.status, t.nextAttemptAt), index("mail_queue_ref").on(t.refId)],
);
// Phones and tablets that receive native notifications (Android: FCM token, iOS: APNs device token).
// A device belongs to the account that last signed in on it; signing out removes it.
export const push_devices = sqliteTable(
  "push_devices",
  {
    token: text("token").primaryKey(),
    userId: text("userId").notNull(),
    platform: text("platform").notNull(),
    createdAt: text("createdAt").notNull(),
    lastSeenAt: text("lastSeenAt").notNull(),
  },
  (t) => [index("push_devices_user").on(t.userId)],
);
