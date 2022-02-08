import Promise from 'bluebird';
import config from '@/config';
import ipfs from '@/helpers/ipfs';
import pkg from '@/../package.json';

export function shorten(str = '') {
  return `${str.slice(0, 6)}...${str.slice(str.length - 4)}`;
}

export function jsonParse(input, fallback?) {
  if (typeof input !== 'string') {
    return fallback || {};
  }
  try {
    return JSON.parse(input);
  } catch (err) {
    return fallback || {};
  }
}

export function clone(item) {
  return JSON.parse(JSON.stringify(item));
}

// assumes etherscan type url structure (ie arbiscan uses the same url structure)
export function blockExplorerLink(str: string, type = 'address'): string {
  return `${config.blockExplorerUrl}/${type}/${str}`;
}

export function lsSet(key: string, value: any) {
  return localStorage.setItem(`${pkg.name}.${key}`, JSON.stringify(value));
}

export function lsGet(key: string) {
  const item = localStorage.getItem(`${pkg.name}.${key}`);
  return jsonParse(item, '');
}

export function lsRemove(key: string) {
  return localStorage.removeItem(`${pkg.name}.${key}`);
}

export function formatProposal(proposal) {
  proposal.msg = jsonParse(proposal.msg, proposal.msg);

  // v0.1.0
  if (proposal.msg.version === '0.1.0') {
    proposal.msg.payload.start = 1595088000;
    proposal.msg.payload.end = 1595174400;
    proposal.msg.payload.snapshot = 10484400;
    proposal.bpt_voting_disabled = '1';
  }

  return proposal;
}

export function formatProposals(proposals) {
  return Object.fromEntries(
    Object.entries(proposals).map(proposal => [
      proposal[0],
      formatProposal(proposal[1])
    ])
  );
}

export const isTxReverted = error => {
  return !error ? false : error.code === -32016;
};

export const isTxRejected = error => {
  return !error ? false : error.code === 4001 || error.code === -32603;
};

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getSnapshot() {
  const url = "https://github.com/balancer-labs/bal-mining-scripts/blob/master/reports/_current.json"
  const claim = await fetch(
    config.snapshotUrl
  );
  const res = await claim.json();

  return res;
  // return (
  //   (await ipfs.get(
  //     `balancer-team-bucket.storage.fleek.co/balancer-claim${networkStr}/snapshot`,
  //     'ipns'
  //   )) || {}
  // );
}

export async function getReports(snapshot, weeks) {
  const reports = {};
  await Promise.all(
    weeks.map(async week => {
      reports[week] = await ipfs.get(snapshot[week]);
    })
  );
  return reports;
}
