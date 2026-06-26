import { useRef, useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { mediaUrl } from '../lib/config.js';

export default function GhibliModal({ onClose, onSend }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  // Clean up the local object URL for the chosen photo.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    setResultUrl('');
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function generate() {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.ghibli(file);
      setResultUrl(res.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function send() {
    onSend({ url: resultUrl, name: 'ghibli-art.png', mime: 'image/png', kind: 'image' });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>✨ Ghibli Art</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </header>

        <p className="cam-hint">Turn a photo into Studio Ghibli–style art, then send it in the chat.</p>

        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*"
          capture="environment"
          onChange={pick}
        />

        <div className="ghibli-stage">
          {!previewUrl && !resultUrl && (
            <button className="ghibli-drop" onClick={() => fileRef.current?.click()}>
              <span className="ghibli-drop-ico">🖼️</span>
              <span>Tap to choose or take a photo</span>
            </button>
          )}

          {(previewUrl || resultUrl) && (
            <div className="ghibli-imgs">
              {previewUrl && (
                <figure>
                  <img src={previewUrl} alt="original" />
                  <figcaption>Original</figcaption>
                </figure>
              )}
              {loading && (
                <figure className="ghibli-loading">
                  <div className="spinner" />
                  <figcaption>Painting… (10–30s)</figcaption>
                </figure>
              )}
              {resultUrl && !loading && (
                <figure>
                  <img src={mediaUrl(resultUrl)} alt="ghibli art" />
                  <figcaption>Ghibli ✨</figcaption>
                </figure>
              )}
            </div>
          )}
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="ghibli-actions">
          {previewUrl && !resultUrl && (
            <button className="btn-primary" onClick={generate} disabled={loading}>
              {loading ? 'Generating…' : '✨ Generate Ghibli art'}
            </button>
          )}
          {resultUrl && (
            <>
              <button className="btn-primary" onClick={send}>Send to chat</button>
              <button className="btn-ghost slim" onClick={() => fileRef.current?.click()}>Try another photo</button>
            </>
          )}
          {!previewUrl && !resultUrl && (
            <button className="btn-ghost slim" onClick={() => fileRef.current?.click()}>Choose photo</button>
          )}
        </div>
      </div>
    </div>
  );
}
