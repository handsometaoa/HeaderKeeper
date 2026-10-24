import { browser } from '#imports';

/** 扩展品牌图标：直接引用工具栏同款珊瑚橙图标资源，保证各处一致 */
export function BrandMark({ className }: { className: string }) {
  return (
    <img
      className={className}
      src={browser.runtime.getURL('/icon-128.png')}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
