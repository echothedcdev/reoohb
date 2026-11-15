(() => {
  "use strict";
  const DEFAULT_ENDPOINT = "https://wdkpojqtftvpfeuctlzi.supabase.co/functions/v1/reoohb-verify";
  class ReoohbWidget extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: "open" }); this.challengeId = null; this.busy = false; this.verified = false; }
    connectedCallback() { if (this.shadowRoot.childElementCount) return; this.render(); this.loadChallenge(); }
    render() {
      this.shadowRoot.innerHTML = \`
        <style>
          :host{display:block;max-width:360px;color:#f5f3ff;font:14px/1.5 system-ui,sans-serif}
          *{box-sizing:border-box}.card{padding:18px;border:1px solid #343044;border-radius:16px;background:#11111b}
          .brand{font-weight:800;color:#d9c6ff}p{margin:7px 0 14px;color:#aaa5bc}
          label{display:block;margin-bottom:6px;font-weight:650}.question{font-size:20px;font-weight:750;margin:10px 0}
          input{width:100%;padding:11px 12px;border:1px solid #454057;border-radius:9px;background:#09090f;color:#fff;font:inherit}
          input:focus{outline:2px solid #9b6bff;outline-offset:2px}
          button{margin-top:11px;padding:10px 14px;border:0;border-radius:9px;background:linear-gradient(100deg,#e83e60,#8958e9);color:white;font:700 14px system-ui;cursor:pointer}
          button:disabled{opacity:.55;cursor:wait}.refresh{margin-left:8px;background:transparent;border:1px solid #454057}
          .message{min-height:22px;margin-top:10px;color:#ff9eac}.success{color:#56d6a0}.fine{font-size:11px;color:#817b94;margin-top:12px}
        </style>
        <section class="card" aria-label="reoohb human verification">
          <div class="brand">reoohb verification</div><p>Answer this quick question to continue.</p>
          <div class="question" id="question" aria-live="polite">Loading challenge…</div>
          <form id="form"><label for="answer">Your answer</label>
            <input id="answer" name="answer" inputmode="numeric" autocomplete="off" pattern="[0-9]*" maxlength="3" required>
            <button id="submit" type="submit" disabled>Verify</button><button class="refresh" id="refresh" type="button">New question</button>
          </form>
          <div class="message" id="message" role="status" aria-live="polite"></div>
          <div class="fine">A basic verification check. It may not stop advanced automated bots.</div>
        </section>\`;
      this.$ = (id) => this.shadowRoot.getElementById(id);
      this.$("form").addEventListener("submit", (event) => { event.preventDefault(); this.verifyAnswer(); });
      this.$("refresh").addEventListener("click", () => this.loadChallenge());
    }
    get endpoint() { return (this.getAttribute("endpoint") || DEFAULT_ENDPOINT).replace(/\/+$/, ""); }
    async request(payload) {
      const response = await fetch(this.endpoint, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload), cache:"no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Verification service request failed.");
      return data;
    }
    async loadChallenge() {
      if (this.busy || this.verified) return;
      const projectId = this.getAttribute("project-id");
      if (!projectId) { this.$("question").textContent = "Project ID missing"; this.$("message").textContent = "Add your reoohb project-id attribute."; return; }
      this.busy = true; this.$("submit").disabled = true; this.$("question").textContent = "Loading challenge…"; this.$("message").textContent = ""; this.$("answer").value = "";
      try {
        const data = await this.request({ action:"challenge", project_id:projectId });
        this.challengeId = data.challenge_id; this.$("question").textContent = data.question; this.$("submit").disabled = false;
      } catch (error) { this.$("question").textContent = "Could not load question"; this.$("message").textContent = error.message; }
      finally { this.busy = false; }
    }
    async verifyAnswer() {
      if (this.busy || this.verified || !this.challengeId) return;
      this.busy = true; this.$("submit").disabled = true; this.$("refresh").disabled = true; this.$("message").textContent = "Checking…";
      try {
        const data = await this.request({ action:"verify", project_id:this.getAttribute("project-id"), challenge_id:this.challengeId, answer:this.$("answer").value.trim() });
        if (!data.verified || !data.code) throw new Error("Verification was not completed.");
        this.verified = true; this.$("question").textContent = "You're verified."; this.$("message").className = "message success";
        this.$("message").textContent = "Continuing securely…"; this.$("form").hidden = true;
        this.dispatchEvent(new CustomEvent("reoohb:verified", { bubbles:true, composed:true, detail:{ code:data.code, projectId:this.getAttribute("project-id") } }));
      } catch (error) {
        this.$("message").className = "message"; this.$("message").textContent = error.message;
        this.busy = false; this.$("refresh").disabled = false; await this.loadChallenge();
      }
    }
  }
  if (!customElements.get("reoohb-widget")) customElements.define("reoohb-widget", ReoohbWidget);
})();