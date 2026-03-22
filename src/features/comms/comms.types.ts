export interface CommsTemplate {
  id: string;
  name: string;
  description: string;
  template: string;    // uses {{variable}} placeholders
  variables: string[];
}

export interface CommsDraft {
  id: string;
  templateId: string;
  content: string;
  redacted: boolean;   // true if redactSecrets found anything
  createdAt: string;
}
