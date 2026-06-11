# Course Mode Behavior Checklist

This checklist defines the expected behavior for the Start Here course-style reading experience.

## Eligibility

- Paid members attributed to `/start-here` purchases see course mode.
- Paid members with one of these labels see course mode: `course`, `start-here`, `experience-course`.
- Admins can manually mark a member as a Start Here course subscriber from the member detail screen; this adds/removes the `start-here` label.
- Paid members who bought from the normal blog homepage keep the normal Ghost article interface.
- Free members and anonymous visitors keep the normal Ghost article interface.
- Visiting `/start-here` by itself does not make a member a course-mode user.

## Course Catalog

- The left catalog uses public Ghost tags as course chapters.
- Posts are listed under their primary tag (`posts_tags.sort_order = 0`).
- Only published posts are listed.
- The active article is highlighted.
- Each catalog row shows a completion state.
- The catalog progress count and progress bar update when completion changes.

## Reading Progress

- Course members can mark the current lesson complete or incomplete.
- Completion is stored per member and per post in `course_post_progress`.
- Non-course members cannot write course progress.
- Deleting a member or post removes its related progress rows via cascade.

## Layout

- Desktop shows a fixed left catalog and keeps the article on the right.
- Desktop catalog can collapse to a narrow rail.
- Collapsed state persists in `localStorage`.
- Mobile does not shift the article body horizontally.
- Mobile opens the catalog from a floating button.
- The article content remains the original Ghost theme output.

## Video Preview

- Authorized users receive the full course video.
- Unauthorized users must not receive the full restricted provider iframe URL.
- Secure 10 percent preview requires a separate provider-side preview asset or clip.
- Client-side player pause at 10 percent is acceptable only as a UX aid, not as an access-control boundary.
- Preview completion shows the relevant login or paid upgrade CTA.
- Preview, CTA, watch, progress, dock, and close events are recorded with a signed event token.

## Deployment Checks

- `course-mode.min.js` is injected on post/page views when members are enabled.
- `course-video.min.js` is injected only when the current post has an enabled course video.
- `/public/course-mode.min.js` and `/public/course-video.min.js` are served by Ghost.
- Database migrations run successfully before the app handles traffic.
