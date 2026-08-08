export default function Avatar({ src, name, size = 34 }) {
  const initials = (name || "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        className="avatar"
        src={src}
        alt={name || "avatar"}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="avatar-fallback"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}
