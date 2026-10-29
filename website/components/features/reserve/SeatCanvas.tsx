import { Armchair, Zap, Sun, Shield, Sparkles } from 'lucide-react';
import { seatLabel } from '../../../lib/model';

export interface SeatItem {
  number: number;
  unavailable: boolean;
}

interface SeatCanvasProps {
  seats: SeatItem[];
  selectedSeat: number;
  onSelectSeat: (seatNumber: number) => void;
  disabled?: boolean;
}

// 模拟自习室空间属性（靠窗、独立插座、护眼台灯等）
function getSeatFeatures(seatNum: number) {
  const isWindow = seatNum <= 4 || (seatNum >= 9 && seatNum <= 12);
  const hasPower = seatNum % 2 !== 0 || isWindow;
  const zone = isWindow ? '阳光靠窗区' : seatNum % 2 === 0 ? '沉浸静音区' : '标准研读区';
  return { isWindow, hasPower, zone };
}

export function SeatCanvas({ seats, selectedSeat, onSelectSeat, disabled }: SeatCanvasProps) {
  return (
    <div className="seat-canvas-container">
      {/* 自习室上方采光大窗景观带 */}
      <div className="classroom-window-banner">
        <Sun size={15} className="sun-icon" />
        <span>景观采光大窗 · 阳光自然透光 · 请保持自律安静</span>
      </div>

      <div className="classroom-layout">
        {/* 左侧绿植与环境角 */}
        <div className="classroom-decor-left">
          <div className="decor-item plant" title="自习室室内绿植景观">
            🌿 绿植角
          </div>
          <div className="decor-item bookshelf" title="共享参考工具书架">
            📚 阅览架
          </div>
        </div>

        {/* 中间主要自习座位矩阵 */}
        <div className="classroom-main-zone">
          <div className="zone-indicator">
            <span className="zone-tag">
              <Shield size={12} /> 专注自习空间
            </span>
            <span className="zone-count">
              共 {seats.length} 席 · 可预约 {seats.filter((s) => !s.unavailable).length} 席
            </span>
          </div>

          <div className="seat-canvas-grid">
            {seats.map((seat) => {
              const { number, unavailable } = seat;
              const isSelected = selectedSeat === number;
              const { isWindow, hasPower, zone } = getSeatFeatures(number);

              return (
                <div
                  key={number}
                  className={`seat-canvas-item ${unavailable ? 'taken' : 'available'} ${
                    isSelected ? 'selected' : ''
                  }`}
                  onClick={() => {
                    if (!unavailable && !disabled) {
                      onSelectSeat(number);
                    }
                  }}
                  role="button"
                  tabIndex={unavailable || disabled ? -1 : 0}
                  aria-pressed={isSelected}
                  aria-disabled={unavailable || disabled}
                  aria-label={`${seatLabel(number)}号座位, ${zone}, ${
                    unavailable ? '已被预约' : '可预约'
                  }`}
                >
                  {/* 座位顶部标签 */}
                  <div className="seat-item-header">
                    <span className="seat-number">{seatLabel(number)}</span>
                    <div className="seat-badges">
                      {hasPower && (
                        <span title="配备电源插座" className="badge-wrap">
                          <Zap size={11} className="badge-icon power" />
                        </span>
                      )}
                      {isWindow && (
                        <span title="靠窗自然采光" className="badge-wrap">
                          <Sun size={11} className="badge-icon window" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 椅子图标 */}
                  <div className="seat-item-body">
                    <Armchair size={28} className="armchair-icon" />
                    {isSelected && <span className="selection-pulse" />}
                  </div>

                  {/* 状态文字 */}
                  <div className="seat-item-footer">
                    <span>{unavailable ? '已占用' : isSelected ? '已选定' : '空闲'}</span>
                  </div>

                  {/* 悬浮 Tooltip 气泡 */}
                  <div className="seat-tooltip">
                    <b>{seatLabel(number)} 号书桌</b>
                    <p>{zone}</p>
                    <div className="tooltip-tags">
                      <span>{hasPower ? '⚡ 220V+USB插座' : '无独立电源'}</span>
                      <span>{isWindow ? '🪟 靠窗景观' : '💡 护眼台灯'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 教室走廊与门入口 */}
          <div className="classroom-corridor">
            <span className="corridor-line" />
            <span className="corridor-text">🚪 自习室正门通道 / 请轻声出入</span>
            <span className="corridor-line" />
          </div>
        </div>

        {/* 右侧配套区 */}
        <div className="classroom-decor-right">
          <div className="decor-item locker" title="存包储物柜">
            🗄️ 储物柜
          </div>
          <div className="decor-item quiet" title="请将手机调至静音模式">
            🔕 保持静音
          </div>
        </div>
      </div>
    </div>
  );
}
