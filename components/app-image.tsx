import Image, { type ImageProps } from "next/image"

/**
 * Drop-in replacement for next/image that automatically bypasses the Next image
 * optimizer for locally-uploaded files (`/uploads/…`).
 *
 * WHY: in production the optimizer (`/_next/image?url=…`) can't fetch `/uploads/`
 * files and returns "The requested resource isn't a valid image", so admin-
 * uploaded trip/blog images render broken. Serving those unoptimized loads the
 * original file directly (same as the homepage hero's plain <img>). Remote/CDN
 * images and bundled `/images/…` assets still get full optimization.
 *
 * USE THIS instead of next/image for ANY image whose src can come from the DB or
 * an admin upload (trip.image, post.image, media, avatars, …). An explicit
 * `unoptimized` prop always wins, so callers can still override per-image.
 */
export function AppImage({ src, unoptimized, ...props }: ImageProps) {
  const isUpload = typeof src === "string" && src.startsWith("/uploads/")
  return <Image src={src} unoptimized={unoptimized ?? isUpload} {...props} />
}

export default AppImage
