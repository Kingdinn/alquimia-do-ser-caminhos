/** Atmospheric blue backdrop used behind login and privacy content. */
export function OrbitSweepBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#14376b",
        backgroundImage: [
          "radial-gradient(ellipse at 72% 18%, rgba(155, 215, 243, .82), transparent 44%)",
          "radial-gradient(ellipse at 20% 80%, rgba(28, 127, 169, .75), transparent 54%)",
          "linear-gradient(145deg, #142b63, #286aa9 52%, #132f5b)",
        ].join(", "),
      }}
    />
  );
}
