import { useState } from 'react';
import { X, ImagePlus, ArrowRight, Scale, Loader2 } from 'lucide-react';
import { CommonProps } from '../../../lib/types';
import { encodePhoto } from '../../../lib/photo';

interface AppealModalProps {
  common: CommonProps;
  onClose: () => void;
  onSuccess: () => void;
}

export function AppealModal({ common, onClose, onSuccess }: AppealModalProps) {
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (reason.trim().length < 5) {
      common.notify('请详细填写申诉理由与事实（至少5个字）');
      return;
    }
    if (common.demo) {
      common.notify('演示模式不提交申诉');
      return;
    }

    setBusy(true);
    try {
      const photos: string[] = [];
      for (const file of files) {
        const base64 = await encodePhoto(file);
        const uploaded = await common.api('uploadEvidence', { base64 });
        photos.push(uploaded.id);
      }

      await common.api('submitAppeal', {
        reason: reason.trim(),
        photos,
      });

      common.notify('申诉材料已提交，工作人员将在24小时内复核');
      common.updated();
      onSuccess();
    } catch (err) {
      common.notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="appeal-modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-heading">
          <div className="modal-title">
            <Scale size={22} className="text-ochre" />
            <h3>违规处罚申诉申请</h3>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <p className="muted">
          如果你认为现场核实有误、存在不可抗力或被恶意举报，请客观陈述事实并附上佐证照片。
        </p>

        {common.user.penalty && (
          <div className="penalty-snapshot">
            <b>当前处于处罚中：</b>
            <span>{common.user.penalty.reason || '违规处罚记录'}</span>
            <small>
              {common.user.penalty.permanent
                ? '（永久封禁）'
                : common.user.penalty.level !== undefined
                ? `（${common.user.penalty.level}级处罚）`
                : ''}
            </small>
          </div>
        )}

        <form onSubmit={submit} className="appeal-form">
          <label>
            申诉说明 <em>*</em>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="请详细说明实际情况（如：实际在座但被误拍、中途因紧急突发状况暂离、他人误坐等，至少5字）"
              minLength={5}
              maxLength={500}
              required
            />
          </label>

          <label>
            证明材料 / 澄清照片 <span className="muted">（选填，最多3张）</span>
            <span className="photo-upload">
              <ImagePlus size={24} />
              <b>选择现场照片或证明截图</b>
              <small>支持 JPG / PNG · 自动优化压缩</small>
              <input
                type="file"
                accept="image/jpeg,image/png"
                multiple
                aria-label="选择申诉证明照片"
                onChange={(e) => {
                  const selectedFiles = Array.from(e.target.files || []).slice(0, 3);
                  setFiles(selectedFiles);
                }}
              />
            </span>
          </label>

          {files.map((file, i) => (
            <div className="file-row" key={i}>
              <span>{file.name}</span>
              <button
                type="button"
                aria-label={'移除' + file.name}
                onClick={() => setFiles(files.filter((_, n) => n !== i))}
              >
                <X size={15} />
              </button>
            </div>
          ))}

          <div className="actions flex-end">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={16} className="spin" /> 提交中…
                </>
              ) : (
                <>
                  提交申诉材料 <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
