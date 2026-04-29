export const apiClient = {
  async listNotebooks() {
    const r = await fetch("/api/notebooks");
    return r.json();
  },
  async chat(input: { message: string; notebookId?: string }) {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return r.json();
  },
};
