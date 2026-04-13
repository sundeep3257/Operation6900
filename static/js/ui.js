window.UI = (() => {
    const modalRoot = () => document.getElementById("modal-root");
    const toastRoot = () => document.getElementById("toast-root");

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function shuffle(array) {
        const copy = [...array];
        for (let i = copy.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function formatClock(secondsLeft) {
        const safe = Math.max(0, Math.floor(secondsLeft));
        const mm = String(Math.floor(safe / 60)).padStart(2, "0");
        const ss = String(safe % 60).padStart(2, "0");
        return `${mm}:${ss}`;
    }

    function showToast(message, lifespanMs = 2800) {
        const root = toastRoot();
        const node = el("div", "toast", message);
        root.appendChild(node);
        window.setTimeout(() => {
            node.remove();
        }, lifespanMs);
    }

    function hideModal() {
        const root = modalRoot();
        root.classList.add("hidden");
        root.innerHTML = "";
    }

    function showModal(contentNode) {
        const root = modalRoot();
        root.classList.remove("hidden");
        root.innerHTML = "";
        root.appendChild(contentNode);
    }

    function makeBar(label, value) {
        const wrap = el("div", "bar-wrap");
        const top = el("div", "row-between");
        top.appendChild(el("span", "tiny-text", label));
        top.appendChild(el("span", "tiny-text", `${Math.floor(value)}%`));
        const bar = el("div", "bar");
        const fill = el("div", "bar-fill");
        fill.style.width = `${clamp(value, 0, 100)}%`;
        if (value > 60) fill.style.background = "#1ea76d";
        else if (value > 30) fill.style.background = "#f3a530";
        else fill.style.background = "#de5252";
        bar.appendChild(fill);
        wrap.append(top, bar);
        return wrap;
    }

    return {
        el,
        clamp,
        shuffle,
        formatClock,
        showToast,
        showModal,
        hideModal,
        makeBar,
    };
})();
