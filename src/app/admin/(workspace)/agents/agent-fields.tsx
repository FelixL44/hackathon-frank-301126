export type AgentValues = {
  name: string;
  slug: string;
  description: string;
  prompt: string;
  requiredFields: string[];
  requiredDocuments: string[];
  sortOrder: number;
};

const EMPTY: AgentValues = {
  name: "",
  slug: "",
  description: "",
  prompt: "",
  requiredFields: [],
  requiredDocuments: [],
  sortOrder: 0,
};

/** Shared by the create form and the edit form. Server-rendered; the enclosing <form> supplies the action. */
export function AgentFields({ agent }: { agent?: AgentValues }) {
  const value = agent ?? EMPTY;
  return (
    <div className="admin-form-grid">
      <div className="admin-field">
        <label className="admin-field-label" htmlFor="agent-name">Name</label>
        <input className="admin-input" id="agent-name" name="name" type="text" defaultValue={value.name} maxLength={120} required />
      </div>

      <div className="admin-field">
        <label className="admin-field-label" htmlFor="agent-slug">Slug</label>
        <input
          className="admin-input"
          id="agent-slug"
          name="slug"
          type="text"
          defaultValue={value.slug}
          pattern="[a-z0-9-]{2,40}"
          maxLength={40}
          required
        />
        <small>Lowercase letters, digits and hyphens, 2–40 characters. Used in links and customer choice.</small>
      </div>

      <div className="admin-field admin-field-wide">
        <label className="admin-field-label" htmlFor="agent-description">Description</label>
        <textarea className="admin-input" id="agent-description" name="description" defaultValue={value.description} maxLength={500} rows={2} />
        <small>Shown to the customer when they choose a claim type.</small>
      </div>

      <div className="admin-field admin-field-wide">
        <label className="admin-field-label" htmlFor="agent-prompt">Prompt</label>
        <textarea className="admin-input admin-prompt" id="agent-prompt" name="prompt" defaultValue={value.prompt} maxLength={5000} rows={5} />
        <small>What the agent checks for this category. Unknown stays unknown; the agent never judges liability or coverage.</small>
      </div>

      <div className="admin-field">
        <label className="admin-field-label" htmlFor="agent-fields">Required fields</label>
        <input
          className="admin-input"
          id="agent-fields"
          name="requiredFields"
          type="text"
          defaultValue={value.requiredFields.join(", ")}
          placeholder="policyReference, incidentDate, damagedArea"
        />
        <small>Comma-separated. Empty entries are ignored.</small>
      </div>

      <div className="admin-field">
        <label className="admin-field-label" htmlFor="agent-documents">Required documents</label>
        <input
          className="admin-input"
          id="agent-documents"
          name="requiredDocuments"
          type="text"
          defaultValue={value.requiredDocuments.join(", ")}
          placeholder="photo, estimate"
        />
        <small>Comma-separated, e.g. photo, estimate or medical report.</small>
      </div>

      <div className="admin-field">
        <label className="admin-field-label" htmlFor="agent-sort">Sort order</label>
        <input className="admin-input" id="agent-sort" name="sortOrder" type="number" min={0} max={999} defaultValue={value.sortOrder} />
        <small>Lower numbers appear first in the customer’s list.</small>
      </div>
    </div>
  );
}
