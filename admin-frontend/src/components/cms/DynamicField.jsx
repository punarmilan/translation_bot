import AssetPickerInput from "./AssetPickerInput";
import RichTextEditor from "./RichTextEditor";

/**
 * Renders one form control for one field-schema entry returned by
 * GET /api/admin/cms/section-types. Adding a new field `type` here makes it
 * available to every section type and every page at once -- no editor ever
 * hardcodes a field list for a specific section or page.
 */
export default function DynamicField({ field, value, onChange }) {
  const commonLabel = <span className="cms-field-label">{field.label}</span>;

  switch (field.type) {
    case "textarea":
      return (
        <label className="cms-field cms-field--wide">
          {commonLabel}
          <textarea
            value={value ?? ""}
            maxLength={field.max_length}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      );
    case "richtext":
      return (
        <div className="cms-field cms-field--wide">
          {commonLabel}
          <RichTextEditor value={value ?? ""} onChange={onChange} />
        </div>
      );
    case "boolean":
      return (
        <label className="cms-field cms-field--checkbox">
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
          {commonLabel}
        </label>
      );
    case "number":
      return (
        <label className="cms-field">
          {commonLabel}
          <input type="number" value={value ?? 0} onChange={(event) => onChange(Number(event.target.value))} />
        </label>
      );
    case "select":
      return (
        <label className="cms-field">
          {commonLabel}
          <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
            {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      );
    case "image":
      return (
        <div className="cms-field cms-field--wide">
          <AssetPickerInput label={field.label} value={value} onChange={onChange} />
        </div>
      );
    case "url":
      return (
        <label className="cms-field">
          {commonLabel}
          <input type="text" value={value ?? ""} placeholder="/path or https://..." onChange={(event) => onChange(event.target.value)} />
        </label>
      );
    case "text":
    default:
      return (
        <label className="cms-field">
          {commonLabel}
          <input type="text" value={value ?? ""} maxLength={field.max_length} onChange={(event) => onChange(event.target.value)} />
        </label>
      );
  }
}
