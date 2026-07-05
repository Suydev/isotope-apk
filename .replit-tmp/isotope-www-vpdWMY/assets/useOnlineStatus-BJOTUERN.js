import {
    r as n
} from "./vendor-react-BfU3Zn2J.js";

function a() {
    const d = () => typeof window < "u" && window.__ISO_IS_ANDROID__ && typeof window.__isoIsOnline == "function" ? window.__isoIsOnline() : navigator.onLine,
        [r, t] = n.useState(d),
        [e, i] = n.useState(!1);
    return n.useEffect(() => {
        const s = () => {
                t(!0), e && i(!1)
            },
            o = () => {
                t(!1), i(!0)
            },
            c = u => {
                const f = !!(u && u.detail && (u.detail.connected ?? u.detail.online));
                f ? s() : o()
            };
        return t(d()), window.addEventListener("online", s), window.addEventListener("offline", o), window.addEventListener("isotope:network", c), () => {
            window.removeEventListener("online", s), window.removeEventListener("offline", o), window.removeEventListener("isotope:network", c)
        }
    }, [e]), {
        isOnline: r,
        wasOffline: e
    }
}
export {
    a as u
};