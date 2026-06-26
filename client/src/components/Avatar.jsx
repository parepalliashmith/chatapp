import { colorFor, initials } from '../lib/util.js';
import { mediaUrl } from '../lib/config.js';

export default function Avatar({ name = '?', src = null, size = 44, group = false, online = false }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  return (
    <div className="avatar-wrap" style={{ width: size, height: size }}>
      {src ? (
        <img className="avatar" src={mediaUrl(src)} alt={name} style={style} />
      ) : (
        <div className="avatar" style={{ ...style, background: group ? '#6b7c85' : colorFor(name) }}>
          {group ? '👥' : initials(name)}
        </div>
      )}
      {online && <span className="online-dot" />}
    </div>
  );
}
