import { useState } from "react";

/**
 * Production image wrapper.
 * Keeps image loading efficient without changing uploaded media URLs.
 * Supports browser-native lazy loading, async decoding and graceful fallback.
 */
export default function OptimizedImage({
  src,
  alt = "",
  className = "",
  loading = "lazy",
  width,
  height,
  priority = false,
  onError,
  ...props
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <div className={`${className} image-fallback`} aria-label={alt} />;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading={priority ? "eager" : loading}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
      {...props}
    />
  );
}
