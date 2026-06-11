# Course Video Admin API

Ghost exposes post course videos as a first-class Admin API resource. Use these endpoints when an external editor, automation, or integration needs to read or edit the video attached to a post without sending a full post update.

## Resource

`course_video` is independent from post visibility. A public post can have a paid-only video, and a members-only post can have a public video.

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string \| null | Course video row ID. `null` when the post has no saved course video. |
| `post_id` | string | Ghost post ID. |
| `post_uuid` | string | Ghost post UUID used by frontend playback resolution. |
| `enabled` | boolean | Whether the course video should render on the post. |
| `provider` | string | `cloudflare_stream` or `youtube`. |
| `provider_video_id` | string \| null | Cloudflare Stream UID or YouTube video ID/URL. Required when `enabled` is `true`. |
| `access` | string | `public`, `members`, or `paid`. |
| `title` | string \| null | Optional display/title metadata. |
| `metadata` | object \| null | Optional structured metadata for integrations. |
| `created_at` | string \| null | ISO timestamp, null for unsaved default responses. |
| `updated_at` | string \| null | ISO timestamp, null when never updated. |

## Read

```http
GET /ghost/api/admin/posts/{post_id}/course_video/
```

Response:

```json
{
  "course_videos": [
    {
      "id": "64f8...",
      "post_id": "64f7...",
      "post_uuid": "4292a5e0-c0fe-445c-a2c3-bf7825a3bd0d",
      "enabled": true,
      "provider": "cloudflare_stream",
      "provider_video_id": "ab7891ef5fefcb18d4a39a0872bf4ef6",
      "access": "paid",
      "title": "Lesson 1",
      "metadata": null,
      "created_at": "2026-05-27T00:00:00.000Z",
      "updated_at": "2026-05-27T00:00:00.000Z"
    }
  ]
}
```

If the post has no saved course video, the endpoint returns a default disabled video object with `id: null`.

## Create Or Update

```http
PUT /ghost/api/admin/posts/{post_id}/course_video/
Content-Type: application/json
```

Body:

```json
{
  "course_videos": [
    {
      "enabled": true,
      "provider": "cloudflare_stream",
      "provider_video_id": "ab7891ef5fefcb18d4a39a0872bf4ef6",
      "access": "members",
      "title": "Lesson 1"
    }
  ]
}
```

Updates are partial. If a video already exists, omitted fields keep their current values.

Supported values:

| Field | Values |
| --- | --- |
| `provider` | `cloudflare_stream`, `youtube` |
| `access` | `public`, `members`, `paid` |

Validation:

- `provider_video_id` is required when `enabled` is `true`.
- `provider` must be `cloudflare_stream` or `youtube`.
- `access` must be `public`, `members`, or `paid`.

## Delete

```http
DELETE /ghost/api/admin/posts/{post_id}/course_video/
```

Returns `204 No Content`. The post remains unchanged; only the independent course video row is removed.

## Existing Post API Support

The normal posts API still supports embedded course video updates:

```http
PUT /ghost/api/admin/posts/{post_id}/?include=course_video
Content-Type: application/json
```

```json
{
  "posts": [
    {
      "updated_at": "2026-05-27T00:00:00.000Z",
      "course_video": {
        "enabled": true,
        "provider": "youtube",
        "provider_video_id": "dQw4w9WgXcQ",
        "access": "public",
        "title": "Public lesson"
      }
    }
  ]
}
```

Use the nested course video endpoint for integrations that only edit video settings. Use the posts endpoint when you are already editing the full post document.
