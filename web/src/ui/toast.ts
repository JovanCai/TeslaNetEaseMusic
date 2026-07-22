// 极简全局提示:任何地方 toast('...') 即可弹一条,由 <Toaster/> 统一渲染。
export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('tm-toast', { detail: message }))
}
