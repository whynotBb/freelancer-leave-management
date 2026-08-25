import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    // SSR에서는 window가 없어 초기값을 undefined로 두고(하이드레이션 시 서버/클라이언트
    // 첫 렌더 결과를 일치시킴), 마운트 후 이 effect에서 실제 값을 한 번 동기 반영한다.
    // shadcn/ui 업스트림 원본과 동일한 패턴이며, lazy useState 초기값으로 바꾸면 좁은
    // 뷰포트에서 SSR과 클라이언트 첫 렌더 결과가 달라져 하이드레이션 불일치가 생길 수
    // 있어 의도적으로 이 형태를 유지한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR 안전성을 위해 의도적으로 유지 (위 설명 참고)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
