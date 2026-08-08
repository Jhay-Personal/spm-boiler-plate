export function initialsFor(name: string | null | undefined): string {
  return (name || "?")
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type AvatarProps = {
  src?: string | null;
  name?: string | null;
  size?: number;
};

export default function Avatar({ src, name, size = 34 }: AvatarProps) {
  if (src) {
    return (
      <img
        className="avatar"
        src={src}
        alt={name ? `${name}'s profile photo` : "Profile photo"}
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="avatar-fallback"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initialsFor(name)}
    </div>
  );
}
