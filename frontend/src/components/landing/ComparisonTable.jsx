const rows = [
  ["Live translated speech", "Available", "Varies", "Varies", "Varies"],
  ["Live translated captions", "Included", "Varies", "Varies", "Varies"],
  ["Chat translated per participant", "Included", "Varies", "Varies", "Varies"],
  ["Preferred listening language", "Included", "Varies", "Varies", "Varies"],
  ["Direct translated messages", "Included", "Varies", "Varies", "Varies"],
  ["Personal voice preference", "Included", "Limited", "Limited", "Limited"],
  ["Host and participant roles", "Included", "Included", "Included", "Included"],
  ["Shareable meeting links", "Included", "Included", "Included", "Included"],
];

export default function ComparisonTable() {
  return (
    <div className="comparison-wrap">
      <table className="comparison-table">
        <caption className="sr-only">High-level meeting platform comparison</caption>
        <thead>
          <tr><th>Capability</th><th>VOXO</th><th>Google Meet</th><th>Zoom</th><th>Teams</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => <td key={cell + index}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="table-note">Product features vary by plan, region, and deployment. This comparison describes broad positioning, not contractual availability.</p>
    </div>
  );
}
