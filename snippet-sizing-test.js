(() => {
    "use strict";
    const station = "https://streaming.live365.com/a54490";
    const minimumScale = 0.25;
    const retryDelays = [2000, 5000, 10000];
    const selector = 'bs-snippet[name="mr-block-party-radio-player"]';

    function number(value, fallback, min, max) {
        const parsed = value == null || String(value).trim() === "" ? NaN : Number(value);
        return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
    }

    function vector(element, attribute, fallback) {
        const raw = element.getAttribute(attribute)?.trim();
        const parts = raw ? raw.split(/\s+/).map(Number) : [];
        return new BS.Vector3(...(parts.length === 3 && parts.every(Number.isFinite) ? parts : fallback));
    }

    function bundleUrl(element, name) {
        const url = new URL(element.getAttribute(name));
        const local = url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)
            && ["127.0.0.1", "localhost"].includes(location.hostname);
        if ((url.protocol !== "https:" && !local) || url.username || url.password || url.hash) {
            throw new Error("The " + name + " attribute needs a stable HTTPS bundle URL.");
        }
        return url.href;
    }

    async function mount(element) {
        const scene = BS.Scene.GetInstance();
        const defaultScale = number(element.getAttribute("scale"), 1, minimumScale, 1);
        async function component(object, type, name) {
            if (!object) throw new Error("Missing object " + name);
            const result = await object.GetComponentAsync(type);
            if (!result) throw new Error("Missing component on " + name);
            return result;
        }

        const windowsUrl = bundleUrl(element, "windows-bundle");
        const androidUrl = bundleUrl(element, "quest-bundle");
        await scene.WaitForUnityLoaded?.();
        const host = new BS.GameObject({
            name: "Mr. Block Party Radio Player",
            localPosition: vector(element, "position", [0, 0.39, 2]),
            localEulerAngles: vector(element, "rotation", [0, 0, 0]),
            localScale: new BS.Vector3(defaultScale, defaultScale, defaultScale)
        });
        try {
            await host.Async();
            await host.AddComponent(new BS.AssetBundle(windowsUrl, "", "", androidUrl, "", "", false, false));
            await host.AddComponent(new BS.KitItem("*"));
        } catch (error) {
            await host.Destroy();
            throw error;
        }

        let radio;
        for (let attempt = 0; attempt < 40 && !radio; attempt++) {
            radio = await host.Find("MrBlockPartyRadio(Clone)") || await host.Find("MrBlockPartyRadio");
            if (!radio && attempt < 39) await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (!radio) {
            await host.Destroy();
            throw new Error("The radio bundle did not create the expected prefab.");
        }
        const panelScale = 0.374 / 5.12;
        const face = new BS.GameObject({
            name: "Radio control face", parent: radio,
            localPosition: new BS.Vector3(0.311, -0.072, -0.364),
            localEulerAngles: new BS.Vector3(0, -23, 0),
            localScale: new BS.Vector3(panelScale, panelScale, panelScale)
        });
        const panel = await face.AddComponent(new BS.UIPanel({ resolution: new BS.Vector2(512, 440) }));
        panel.SetBackgroundColor(new BS.Vector4(0.006, 0.016, 0.021, 1));
        const layout = new BS.UIVisualElement(panel);
        layout.SetStyles({ margin: 8, height: 424, paddingTop: 16, paddingBottom: 16, paddingLeft: 17, paddingRight: 17,
            borderWidth: 2, borderColor: "#244B54", borderRadius: 8 });

        function row(parent, styles = {}) {
            const item = new BS.UIVisualElement(panel, parent);
            item.SetStyles({ flexDirection: "row", alignItems: "center", ...styles });
            return item;
        }
        function label(parent, text, fontSize, color, styles = {}) {
            const item = new BS.UILabel(panel, parent);
            item.text = text;
            item.SetStyles({ fontSize, color, margin: 0, ...styles });
            return item;
        }
        function control(parent, text, width, height, color, backgroundColor, borderColor) {
            const item = new BS.UIButton(panel, parent);
            item.text = text;
            item.enabled = false;
            item.SetStyles({ width, height, fontSize: 29, fontWeight: "bold",
                color, backgroundColor, margin: 0, borderWidth: 2, borderColor,
                borderLeftWidth: 5, borderRadius: 5 });
            return item;
        }

        const header = row(layout, { height: 51, paddingLeft: 12, paddingRight: 12,
            backgroundColor: "#102530", borderBottomWidth: 2, borderBottomColor: "#316B74" });
        const lamp = new BS.UIVisualElement(panel, header);
        lamp.SetStyles({ width: 14, height: 14, borderRadius: 7, marginRight: 11, backgroundColor: "#81B9BA" });
        const status = label(header, "INITIALIZING", 22, "#A7DDDD",
            { fontWeight: "bold", whiteSpace: "nowrap", textOverflow: "ellipsis" });
        label(layout, "MR. BLOCK PARTY RADIO", 33, "#E4FFFF", {
            fontWeight: "bold", marginTop: 12, marginBottom: 15, whiteSpace: "nowrap",
            unityTextOutlineWidth: 0.32, unityTextOutlineColor: "#143840"
        });

        const transport = row(layout, { justifyContent: "space-between", marginBottom: 17 });
        const play = control(transport, "PLAY", 248, 84, "#FFF5F2", "#6C2427", "#FF776E");
        const mute = control(transport, "MUTE", 194, 84, "#DBFFFF", "#122E39", "#44858D");

        const volumeDeck = new BS.UIVisualElement(panel, layout);
        volumeDeck.SetStyles({ backgroundColor: "#0B2028", borderWidth: 2, borderColor: "#2C5660",
            borderRadius: 5, paddingTop: 12, paddingBottom: 14, paddingLeft: 12, paddingRight: 12 });
        const level = row(volumeDeck, { justifyContent: "space-between", marginBottom: 9 });
        const down = control(level, "−", 74, 66, "#DBFFFF", "#143442", "#44858D");
        const volumeLabel = label(level, "", 28, "#E4FFFF", { fontWeight: "bold" });
        const up = control(level, "+", 74, 66, "#DBFFFF", "#143442", "#44858D");
        const meter = row(volumeDeck, { justifyContent: "space-between", height: 18 });
        const segments = Array.from({ length: 20 }, () => {
            const segment = new BS.UIVisualElement(panel, meter);
            segment.SetStyles({ width: 16, height: 14, backgroundColor: "#213D45",
                borderTopWidth: 2, borderTopColor: "#345662" });
            return segment;
        });

        let volume = Math.round(number(element.getAttribute("volume"), 50, 0, 100));
        let muted = false;
        function showVolume() {
            volumeLabel.text = muted ? "MUTED" : "VOL   " + volume + "%";
            segments.forEach((segment, index) => {
                const lit = !muted && volume > index * 5;
                segment.style.backgroundColor = lit ? "#43CFC0" : "#213D45";
                segment.style.borderTopColor = lit ? "#B3FFF1" : "#345662";
            });
            mute.text = muted ? "UNMUTE" : "MUTE";
            mute.style.backgroundColor = muted ? "#4C2028" : "#122E39";
            mute.style.borderColor = muted ? "#FF776E" : "#44858D";
        }
        showVolume();

        const scaleFile = "mr-block-party-radio-size-v1";
        const storage = BS.PersistFileBridge;
        let scale = defaultScale;
        let scaleBusy = false;
        let readingScale = false;
        let scaleRevision = 0;
        let ownerControls;
        let scaleTimer;

        async function applyScale(next) {
            if (next !== scale) {
                await host.SetLocalScale(new BS.Vector3(next, next, next));
                scale = next;
            }
            if (ownerControls) ownerControls.caption.text = "SIZE " + Math.round(scale * 100) + "%";
        }

        async function saveScale(step) {
            if (!ownerControls || scaleBusy) return;
            const next = number(Math.round((scale + step) * 100) / 100, scale, minimumScale, 1);
            if (next === scale) return;
            scaleBusy = true;
            scaleRevision++;
            ownerControls.caption.text = "SAVING…";
            try {
                if (!(await storage.info(scene)).canWrite) throw new Error("World owner access required");
                await storage.set(scene, scaleFile, JSON.stringify({ scale: next }));
                await applyScale(next);
            } catch (error) {
                ownerControls.caption.text = "RESIZE FAILED";
                console.warn("[Mr. Block Party Radio] Could not resize the radio", error);
            } finally {
                scaleBusy = false;
            }
        }

        async function readScale() {
            if (scaleBusy || readingScale) return;
            readingScale = true;
            const revision = scaleRevision;
            try {
                try {
                    const savedText = await storage.get(scene, scaleFile);
                    const saved = savedText === null ? null : JSON.parse(savedText);
                    if (!scaleBusy && revision === scaleRevision) {
                        await applyScale(number(saved?.scale, defaultScale, minimumScale, 1));
                    }
                } catch (error) {
                    if (!readScale.warned) {
                        readScale.warned = true;
                        console.warn("[Mr. Block Party Radio] Saved size unavailable", error);
                    }
                }
                if (!ownerControls && scene.localUser && (await storage.info(scene)).canWrite) {
                    const sizeRow = row(layout, { justifyContent: "space-between", marginTop: 8 });
                    const smaller = control(sizeRow, "−", 74, 43, "#DBFFFF", "#143442", "#44858D");
                    const caption = label(sizeRow, "SIZE " + Math.round(scale * 100) + "%", 23, "#E4FFFF");
                    const larger = control(sizeRow, "+", 74, 43, "#DBFFFF", "#143442", "#44858D");
                    ownerControls = { caption };
                    smaller.enabled = larger.enabled = true;
                    smaller.OnClick(() => void saveScale(-0.05));
                    larger.OnClick(() => void saveScale(0.05));
                }
            } catch (error) {
                if (!readScale.warned) {
                    readScale.warned = true;
                    console.warn("[Mr. Block Party Radio] Saved size unavailable", error);
                }
            } finally {
                readingScale = false;
            }
        }

        if (storage) {
            void readScale();
            scaleTimer = setInterval(readScale, 4000);
        }

        const sharedEndpoint = window.MrBlockPartyShared?.localEndpoint(element.getAttribute("shared-endpoint"));
        let mode = "personal", sharedPlaying = false, sharedBusy = false, shared;
        let modeButton, ringObject, ringMaterial;
        const stateKey = "mrBlockPartyRadioModeV1";
        let stream, sources;
        try {

            stream = await component(radio, BS.Unity.AudioStream, "radio prefab");
            sources = await Promise.all(["MrBlockPartyRadioLeft", "MrBlockPartyRadioRight"].map(async name =>
                component(await radio.Find(name), BS.Unity.AudioSource, name)
            ));
            await stream.SetUrl(station);
        } catch (error) {
            status.text = "RADIO SETUP MISSING";
            lamp.style.backgroundColor = "#E67062";
            console.error("[Mr. Block Party Radio]", error);
            return;
        }

        let listening = false;
        let attempt = 0;
        let generation = 0;
        let timer;
        let queue = Promise.resolve();
        const states = BS.Unity.BSAudioStreamState;

        function enqueue(task) {
            queue = queue.then(task).catch(error => console.warn("[Mr. Block Party Radio]", error));
            return queue;
        }
        function gain() {
            return Promise.all(sources.map(source => source.SetVolume(muted ? 0 : volume / 100)));
        }
        function display(message) {
            const live = message === "Playing live" || message === "Shared live";
            status.text = live ? "LIVE" : message.toUpperCase();
            lamp.style.backgroundColor = live ? "#FF665C" : "#81B9BA";
            status.style.color = live ? "#FFD3CD" : "#A7DDDD";
            header.style.borderBottomColor = live ? "#F66C62" : "#316B74";
            play.style.backgroundColor = listening ? "#4F1820" : "#6C2427";
            play.text = mode === "shared" ? (scene.localUser?.isSpaceAdmin ? (sharedPlaying ? "STOP" : "START")
                : shared?.joined ? "LEAVE" : "LISTEN") : listening ? "STOP" : "PLAY";
        }
        function stop(message) {
            listening = false;
            generation++;
            clearTimeout(timer);
            enqueue(() => stream.Stop());
            display(message);
        }
        function retry() {
            if (attempt === retryDelays.length) {
                stop("Unavailable · retry with Play");
                return;
            }
            const delay = retryDelays[attempt++];
            display("Reconnecting in " + delay / 1000 + " s");
            timer = setTimeout(connect, delay);
        }
        function monitor(id, deadline) {
            timer = setTimeout(() => enqueue(async () => {
                if (id !== generation) return;
                let state;
                try {
                    state = await stream.GetState();
                } catch {
                    if (id === generation) retry();
                    return;
                }
                if (id !== generation) return;
                if (state === states.Playing) {
                    display("Playing live");
                    monitor(id, Date.now() + 20000);
                    return;
                }
                if (state === states.Failed || state === states.Stopped || Date.now() >= deadline) {
                    retry();
                    return;
                }
                display(state === states.Buffering ? "Buffering…" : "Connecting…");
                monitor(id, deadline);
            }), 750);
        }
        function connect() {
            const id = generation;
            display("Connecting…");
            enqueue(async () => {
                if (id !== generation) return;
                try {
                    await stream.Stop();
                    await gain();
                    if (id !== generation) return;
                    await stream.Play();
                    if (id === generation) monitor(id, Date.now() + 20000);
                } catch {
                    if (id === generation) retry();
                }
            });
        }

        async function createSharedRing() {
            if (ringObject) return;
            ringObject = new BS.GameObject({
                name: "Shared radio pulse ring", parent: radio, active: false,
                localPosition: new BS.Vector3(-0.202, 0.012, -0.377),
                localScale: new BS.Vector3(1, 1.12, 1)
            });
            await ringObject.AddComponent(new BS.Torus({
                radius: 0.195, tube: 0.0045, radialSegments: 6, tubularSegments: 36
            }));
            ringMaterial = await ringObject.AddComponent(new BS.Material({
                shaderName: "Unlit/Diffuse", color: new BS.Vector4(0.38, 0.022, 0.01, 1)
            }));
            ringObject.active = mode === "shared" && Boolean(shared?.joined);
        }

        async function joinShared() {
            if (shared.joined) return;
            shared.slot = scene.localUser?.isSpaceAdmin ? "a" : "b";
            await shared.join();
            if (mode !== "shared") { shared.leave(); return; }
            void createSharedRing().catch(error => console.warn("[Shared radio] Ring unavailable", error));
        }

        function leaveShared() {
            shared?.leave();
            if (ringObject) ringObject.active = false;
        }

        function applyMode(snapshot) {
            const nextMode = snapshot?.mode === "shared" ? "shared" : "personal";
            const nextPlaying = nextMode === "shared" && snapshot.playing === true;
            const modeChanged = mode !== nextMode;
            const stoppedShared = sharedPlaying && !nextPlaying;
            if (!modeChanged && !stoppedShared && nextPlaying === sharedPlaying) return;
            if (modeChanged && listening) stop("Stopped");
            if (modeChanged || stoppedShared) leaveShared();
            mode = nextMode;
            sharedPlaying = nextPlaying;
            if (modeButton) modeButton.text = mode === "shared" ? "SHARED" : "PERSONAL";
            display(mode === "personal" ? "Stopped" : sharedPlaying ?
                (shared.joined ? "Shared buffering" : "Shared · Listen") : "Shared · Stopped");
            console.log("[Shared radio] Mode " + mode + ", host playback " + sharedPlaying);
        }

        async function setSharedState(snapshot) {
            const state = snapshot.playing ? "playing" : snapshot.mode;
            await scene.SpaceStateSet(stateKey, state, { protected: true });
            applyMode(snapshot);
        }

        async function changeMode() {
            if (!scene.localUser?.isSpaceAdmin || sharedBusy) return;
            sharedBusy = true;
            try {
                if (sharedPlaying) await shared.stopHost();
                await setSharedState({ mode: mode === "shared" ? "personal" : "shared", playing: false });
            } catch (error) {
                console.warn("[Shared radio] Mode change failed", error);
                display("Mode change unavailable");
            } finally {
                sharedBusy = false;
            }
        }

        async function sharedTransport() {
            if (sharedBusy) return;
            sharedBusy = true;
            try {
                if (!scene.localUser?.isSpaceAdmin) {
                    if (shared.joined) {
                        leaveShared();
                        display(sharedPlaying ? "Shared · Listen" : "Shared · Stopped");
                    } else {
                        await joinShared();
                        play.text = shared.joined ? "LEAVE" : "LISTEN";
                    }
                    return;
                }
                if (sharedPlaying) {
                    await shared.stopHost();
                    await setSharedState({ mode: "shared", playing: false });
                    return;
                }
                await joinShared();
                await shared.startHost();
                try {
                    await setSharedState({ mode: "shared", playing: true });
                } catch (error) {
                    await shared.stopHost();
                    throw error;
                }
            } catch (error) {
                leaveShared();
                console.warn("[Shared radio] Transport failed", error);
                display("Shared start unavailable");
            } finally {
                sharedBusy = false;
            }
        }

        let stateTimer;
        if (sharedEndpoint) {
            const { SharedStream } = window.MrBlockPartyShared;
            shared = new SharedStream(sharedEndpoint, scene.localUser?.isSpaceAdmin ? "a" : "b", {
                status: message => { if (mode === "shared" && shared.joined) display(message); },
                ring: rgb => {
                    if (ringMaterial && ringObject.active) ringMaterial.color = new BS.Vector4(...rgb, 1);
                }
            });
            shared.setVolume(volume / 100, muted);
            function showHostControl() {
                const host = Boolean(scene.localUser?.isSpaceAdmin);
                if (host && !modeButton) {
                    status.SetStyle("flexGrow", 1);
                    modeButton = control(header, mode === "shared" ? "SHARED" : "PERSONAL",
                        129, 37, "#B6E8E5", "#163A43", "#44858D");
                    modeButton.SetStyles({ fontSize: 14, borderLeftWidth: 2 });
                    modeButton.enabled = true;
                    modeButton.OnClick(changeMode);
                    console.log("[Shared radio] Host controls ready");
                }
                if (modeButton) modeButton.visible = host;
            }
            console.log("[Shared radio] Local coordinator configured at " + sharedEndpoint);
            const readMode = async () => {
                showHostControl();
                if (sharedBusy) return;
                try {
                    const snapshot = await scene.SpaceStateGet(stateKey);
                    if (!sharedBusy && ["personal", "shared", "playing"].includes(snapshot)) {
                        applyMode({ mode: snapshot === "personal" ? "personal" : "shared", playing: snapshot === "playing" });
                    }
                } catch (error) {
                    if (!shared.stateErrorLogged) {
                        console.warn("[Shared radio] Protected state unavailable", error);
                        shared.stateErrorLogged = true;
                    }
                }
            };
            await readMode();
            stateTimer = setInterval(readMode, 1250);
        }

        play.OnClick(() => {
            if (mode === "shared") { void sharedTransport(); return; }
            if (listening) {
                stop("Stopped");
                return;
            }
            listening = true;
            attempt = 0;
            connect();
        });
        mute.OnClick(() => {
            muted = !muted;
            showVolume();
            shared?.setVolume(volume / 100, muted);
            enqueue(gain);
        });
        function changeVolume(step) {
            volume = number(volume + step, volume, 0, 100);
            showVolume();
            shared?.setVolume(volume / 100, muted);
            enqueue(gain);
        }
        down.OnClick(() => changeVolume(-5));
        up.OnClick(() => changeVolume(5));
        window.addEventListener("pagehide", () => {
            clearInterval(stateTimer);
            clearInterval(scaleTimer);
            leaveShared();
            if (listening) stop("Stopped");
        }, { once: true });
        play.enabled = mute.enabled = down.enabled = up.enabled = true;
        if (mode === "personal") display("Stopped");
    }

    window.addEventListener("bs-loaded", () => {
        const element = document.querySelector(selector);
        if (element) mount(element).catch(error => console.error("[Mr. Block Party Radio]", error));
    }, { once: true });
})();
