import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";

export default function AttachmentsPanel({ orderId, onClose }) {
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState("");

  // add attachment form
  const [label, setLabel] = useState("");
  const [googleUrl, setGoogleUrl] = useState("");
  const [note, setNote] = useState("");

  // add version form
  const [newUrl, setNewUrl] = useState("");
  const [newNote, setNewNote] = useState("");
  const [selectedAttachmentId, setSelectedAttachmentId] = useState("");

  async function refresh() {
    setErr("");
    try {
      const o = await api.orderDetail(orderId);
      setOrder(o);
    } catch (e) {
      setErr(e.message || "Failed to load order");
    }
  }

  useEffect(() => {
    refresh();
  }, [orderId]);

  const attachments = useMemo(() => {
    const list = (order?.attachments || []).filter(a => !a.isArchived);
    // newest first by createdAt-ish (id order isn’t guaranteed, but ok)
    return list;
  }, [order]);

  async function onAddAttachment() {
    setErr("");
    const initials = prompt("Enter your initials (2–3 letters):");
    if (!initials) return;

    try {
      await api.createAttachment(orderId, {
        label: label.trim(),
        googleUrl: googleUrl.trim(),
        note: note.trim() || null,
        initials: initials.trim(),
      });
      setLabel("");
      setGoogleUrl("");
      setNote("");
      await refresh();
    } catch (e) {
      setErr(e.message || "Failed to add attachment");
    }
  }

  async function onAddVersion() {
    setErr("");
    if (!selectedAttachmentId) return setErr("Pick an attachment to add a new version to.");
    const initials = prompt("Enter your initials (2–3 letters):");
    if (!initials) return;

    try {
      await api.addAttachmentVersion(orderId, selectedAttachmentId, {
        googleUrl: newUrl.trim(),
        note: newNote.trim() || null,
        initials: initials.trim(),
      });
      setNewUrl("");
      setNewNote("");
      await refresh();
    } catch (e) {
      setErr(e.message || "Failed to add version");
    }
  }

  async function onArchive(att) {
    const yes = confirm(`Archive "${att.label}"? (It will stop showing in PDF as current.)`);
    if (!yes) return;

    const initials = prompt("Enter your initials (2–3 letters):");
    if (!initials) return;

    try {
      await api.archiveAttachment(orderId, att.id, initials.trim());
      await refresh();
    } catch (e) {
      setErr(e.message || "Failed to archive");
    }
  }

  const currentLine = (att) => {
    const versions = att.versions || [];
    const current = versions.find(v => v.isCurrent) || versions[0];
    if (!current) return "No versions";
    return `v${current.versionNumber}${current.note ? ` — ${current.note}` : ""}`;
  };

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="h2">Attachments</div>
          <div style={{ color: "var(--muted)", fontWeight: 700, fontSize: 12 }}>
            Google links + versioning (new link per version). PDF shows current versions only.
          </div>
        </div>
        <button className="btn" onClick={onClose}>Close</button>
      </div>

      {err && (
        <div className="notice" style={{ marginTop: 10 }}>
          {err}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Current attachments</div>

        {attachments.length === 0 ? (
          <div style={{ color: "var(--muted)", fontWeight: 700 }}>No attachments yet.</div>
        ) : (
          <table className="table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Label</th>
                <th>Current</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
  {attachments.map((att) => {
    // Find current version from versions[]
    const current =
      Array.isArray(att.versions)
        ? att.versions.find(v => v.isCurrent) ||
          [...att.versions].sort(
            (a, b) => (b.versionNumber || 0) - (a.versionNumber || 0)
          )[0]
        : null;

    const url = current?.googleUrl || "";

    return (
      <tr key={att.id}>
        <td>
          <strong>{att.label}</strong>
        </td>

        <td style={{ color: "var(--muted)", fontWeight: 700 }}>
          {current ? (
            <>
              v{current.versionNumber}
              {current.note && (
                <div style={{ fontSize: 12 }}>{current.note}</div>
              )}
            </>
          ) : (
            "—"
          )}
        </td>

        <td style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              Open
            </a>
          )}

          <button
            className="btn danger"
            type="button"
            onClick={() => onArchive(att)}
          >
            Archive
          </button>
        </td>
      </tr>
    );
  })}
</tbody>


          </table>
        )}
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="card" style={{ marginTop: 0 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Add new attachment</div>

          <input className="input" placeholder="Label (ex: Proof, Invoice, Design v1)"
                 value={label} onChange={(e) => setLabel(e.target.value)} />

          <input className="input" placeholder="Google link URL (share link)"
                 value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)}
                 style={{ marginTop: 10 }} />

          <input className="input" placeholder="Note (optional)"
                 value={note} onChange={(e) => setNote(e.target.value)}
                 style={{ marginTop: 10 }} />

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button className="btn primary" type="button" onClick={onAddAttachment}>
              Add Attachment
            </button>
          </div>
        </div>

        <div className="card" style={{ marginTop: 0 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Add new version</div>

          <select className="input" value={selectedAttachmentId}
                  onChange={(e) => setSelectedAttachmentId(e.target.value)}>
            <option value="">Pick attachment...</option>
            {attachments.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>

          <input className="input" placeholder="New Google link URL (new link per version)"
                 value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                 style={{ marginTop: 10 }} />

          <input className="input" placeholder="Note (optional)"
                 value={newNote} onChange={(e) => setNewNote(e.target.value)}
                 style={{ marginTop: 10 }} />

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button className="btn primary" type="button" onClick={onAddVersion}>
              Add Version
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
