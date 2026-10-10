/** A quiet, original sky gradient for optional demo surfaces. */
export function GradientBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#dbeaf2",
        backgroundImage: [
          "radial-gradient(ellipse at 18% 76%, #55add8 0%, transparent 48%)",
          "radial-gradient(ellipse at 80% 22%, #f4f7ed 0%, transparent 56%)",
          "linear-gradient(135deg, #bcd5ea, #dce9ee 55%, #98bfd2)",
        ].join(", "),
      }}
    />
  );
}
