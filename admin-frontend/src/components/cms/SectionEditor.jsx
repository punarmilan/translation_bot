import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import DynamicField from "./DynamicField";

/**
 * Generic editor for one section instance. Every field and every card field
 * comes from the section-type schema (see admin-backend/app/cms/section_types.py)
 * -- this component has no knowledge of "hero" vs "faq" vs any other type, so
 * adding a new section type never requires touching this file.
 */
export default function SectionEditor({ section, sectionType, index, total, onChange, onDelete, onMove, onToggleHide }) {
  const [expanded, setExpanded] = useState(false);
  if (!sectionType) {
    return (
      <section className="cms-section-card">
        <p className="admin-empty-copy">Unknown section type "{section.type}" -- it may have been removed from the registry.</p>
      </section>
    );
  }

  const setField = (key, value) => onChange({ ...section, [key]: value });

  const cards = section.cards || [];
  const setCard = (cardIdx, key, value) => {
    const next = [...cards];
    next[cardIdx] = { ...next[cardIdx], [key]: value };
    onChange({ ...section, cards: next });
  };
  const addCard = () => {
    const blank = {};
    for (const field of sectionType.card_fields || []) blank[field.key] = field.default ?? "";
    onChange({ ...section, cards: [...cards, blank] });
  };
  const deleteCard = (cardIdx) => onChange({ ...section, cards: cards.filter((_, i) => i !== cardIdx) });

  return (
    <section className="cms-section-card" data-hidden={section.hidden ? "true" : "false"}>
      <header className="cms-section-card__header">
        <div className="cms-section-card__title">
          <span>#{index + 1} {section.name || sectionType.label}</span>
          <span className="cms-section-card__type">{sectionType.label}</span>
          {section.hidden && <span className="cms-page-status cms-page-status--draft">Hidden</span>}
        </div>
        <div className="cms-section-card__actions">
          {sectionType.supports_cards && (
            <button type="button" className="admin-button admin-button--secondary" onClick={() => setExpanded((v) => !v)} title="Toggle cards editor">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span style={{ marginLeft: 4 }}>{sectionType.card_label || "Card"}s ({cards.length})</span>
            </button>
          )}
          <button type="button" className="admin-button admin-button--secondary" disabled={index === 0} onClick={() => onMove(-1)} title="Move up"><ArrowUp size={14} /></button>
          <button type="button" className="admin-button admin-button--secondary" disabled={index === total - 1} onClick={() => onMove(1)} title="Move down"><ArrowDown size={14} /></button>
          <button type="button" className="admin-button admin-button--secondary" onClick={onToggleHide} title={section.hidden ? "Unhide" : "Hide"}>
            {section.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button type="button" className="admin-button admin-button--secondary" onClick={onDelete} title="Delete section" style={{ color: "var(--danger)" }}><Trash2 size={14} /></button>
        </div>
      </header>

      <label className="cms-field" style={{ marginBottom: 14 }}>
        <span className="cms-field-label">Section name (admin-only label)</span>
        <input type="text" value={section.name || ""} onChange={(event) => setField("name", event.target.value)} />
      </label>

      <div className="admin-form-grid">
        {sectionType.fields.map((field) => (
          <DynamicField key={field.key} field={field} value={section[field.key]} onChange={(value) => setField(field.key, value)} />
        ))}
      </div>

      {sectionType.supports_cards && (expanded || cards.length > 0) && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", margin: 0, color: "var(--text)" }}>
              {sectionType.card_label || "Card"}s ({cards.length})
            </h4>
            <button type="button" className="admin-button admin-button--secondary" onClick={addCard} style={{ fontSize: 11 }}>
              <Plus size={13} />Add {sectionType.card_label || "card"}
            </button>
          </div>
          <div className="cms-card-list">
            {cards.map((card, cardIdx) => (
              <div className="cms-card-item" key={cardIdx}>
                <div className="cms-card-item__header">
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--primary)" }}>#{cardIdx + 1}</span>
                  <button type="button" onClick={() => deleteCard(cardIdx)} style={{ border: "none", background: "transparent", color: "var(--danger)", cursor: "pointer" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                {(sectionType.card_fields || []).map((field) => (
                  <DynamicField key={field.key} field={field} value={card[field.key]} onChange={(value) => setCard(cardIdx, field.key, value)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
