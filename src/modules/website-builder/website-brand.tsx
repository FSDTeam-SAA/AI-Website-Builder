/** NOVYA monogram and wordmark from the business-owner dashboard sidebar. */
export function WebsiteBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="kw-novya-brand" role="img" aria-label="NOVYA">
      <span className="kw-novya-monogram" aria-hidden="true">N</span>
      {!compact && <span className="kw-novya-wordmark" aria-hidden="true">NOVYA</span>}
    </span>
  );
}
