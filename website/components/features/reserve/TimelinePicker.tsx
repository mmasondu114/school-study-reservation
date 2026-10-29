import { useState, useId } from 'react';
import { Clock3, ArrowRight, Minus, Plus } from 'lucide-react';
import { time } from '../../../lib/model';

interface TimelinePickerProps {
  openSlot: number;
  closeSlot: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  disabled?: boolean;
}

export function TimelinePicker({
  openSlot,
  closeSlot,
  start,
  end,
  onChange,
  disabled,
}: TimelinePickerProps) {
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const startSelectId = useId();
  const endSelectId = useId();

  const totalSlots = closeSlot - openSlot;
  const slots = Array.from({ length: totalSlots }, (_, i) => openSlot + i);

  // 点击时间块快捷选段
  const handleSlotClick = (slot: number) => {
    if (disabled) return;
    if (slot < start) {
      // 往前扩展
      onChange(slot, end);
    } else if (slot >= end) {
      // 往后扩展
      onChange(start, slot + 1);
    } else {
      // 在当前区间内点击：若点在后半部则缩减结束时间，若点在前半部则调整开始时间
      if (slot === start && end > start + 1) {
        onChange(start + 1, end);
      } else {
        onChange(start, slot + 1);
      }
    }
  };

  const handleDecreaseDuration = () => {
    if (end > start + 1) {
      onChange(start, end - 1);
    }
  };

  const handleIncreaseDuration = () => {
    if (end < closeSlot) {
      onChange(start, end + 1);
    }
  };

  const durationHours = (end - start) / 2;

  return (
    <div className="timeline-picker-wrapper">
      <div className="timeline-header">
        <div className="timeline-title">
          <Clock3 size={16} />
          <span>预约自习时段（30分钟为单位）</span>
        </div>
        <div className="timeline-quick-controls">
          <span className="duration-pill">
            时长：<b>{durationHours}</b> 小时
          </span>
          <button
            type="button"
            className="duration-btn"
            onClick={handleDecreaseDuration}
            disabled={disabled || end <= start + 1}
            title="减少30分钟"
            aria-label="减少30分钟"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="duration-btn"
            onClick={handleIncreaseDuration}
            disabled={disabled || end >= closeSlot}
            title="增加30分钟"
            aria-label="增加30分钟"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* 甘特图交互时间轴 */}
      <div className="timeline-bar-container">
        {/* 整点刻度标签 */}
        <div className="timeline-ticks">
          {slots
            .filter((s) => s % 2 === 0)
            .map((s) => (
              <span key={s} className="tick-label">
                {time(s)}
              </span>
            ))}
        </div>

        {/* 半小时色块轨道 */}
        <div className="timeline-track">
          {slots.map((slot) => {
            const isSelected = slot >= start && slot < end;
            const isStart = slot === start;
            const isEnd = slot === end - 1;
            const isHovered =
              hoverSlot !== null &&
              ((hoverSlot > end && slot >= end && slot <= hoverSlot) ||
                (hoverSlot < start && slot >= hoverSlot && slot < start));

            return (
              <button
                key={slot}
                type="button"
                className={`timeline-slot ${isSelected ? 'selected' : ''} ${
                  isStart ? 'slot-start' : ''
                } ${isEnd ? 'slot-end' : ''} ${isHovered ? 'hovered' : ''}`}
                onClick={() => handleSlotClick(slot)}
                onMouseEnter={() => setHoverSlot(slot)}
                onMouseLeave={() => setHoverSlot(null)}
                disabled={disabled}
                title={`${time(slot)} — ${time(slot + 1)}（点击快速选取）`}
                aria-label={`${time(slot)}至${time(slot + 1)}`}
                aria-pressed={isSelected}
              >
                {slot % 2 === 0 && <span className="hour-separator" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 辅助下拉微调控制栏 */}
      <div className="time-controls timeline-fallback">
        <label htmlFor={startSelectId}>
          开始时间
          <select
            id={startSelectId}
            value={start}
            disabled={disabled}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange(n, Math.min(closeSlot, Math.max(n + 1, end)));
            }}
          >
            {Array.from({ length: closeSlot - openSlot }, (_, i) => i + openSlot).map((n) => (
              <option key={n} value={n}>
                {time(n)}
              </option>
            ))}
          </select>
        </label>

        <ArrowRight size={18} className="arrow-sep" />

        <label htmlFor={endSelectId}>
          结束时间
          <select
            id={endSelectId}
            value={end}
            disabled={disabled}
            onChange={(e) => onChange(start, Number(e.target.value))}
          >
            {Array.from({ length: closeSlot - start }, (_, i) => i + start + 1).map((n) => (
              <option key={n} value={n}>
                {time(n)}
              </option>
            ))}
          </select>
        </label>

        <div className="duration-badge">
          <span>当前区间</span>
          <b>
            {time(start)} — {time(end)}
          </b>
        </div>
      </div>
    </div>
  );
}
