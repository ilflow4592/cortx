export interface Project {
  id: string;
  name: string;
  localPath: string;
  githubOwner: string;
  githubRepo: string;
  baseBranch: string;
  slackChannels: string[]; // channel IDs to monitor
  color: string;
  createdAt: string;
}
