import net from "node:net";

import { ForbiddenRequestError } from "@app/lib/errors";

import { extractIPDetails } from "./index";

const cidrPattern = /^(?<ip>[^/]+)(?:\/(?<prefix>\d+))?$/;

const buildBlockListFromCidrs = (cidrs: string[]) => {
  const blockList = new net.BlockList();
  for (const cidr of cidrs) {
    const match = cidrPattern.exec(cidr.trim());
    if (!match?.groups) continue;
    const { ip, prefix } = match.groups;
    if (!net.isIPv4(ip) && !net.isIPv6(ip)) continue;
    const type = net.isIPv4(ip) ? "ipv4" : "ipv6";
    if (prefix) {
      blockList.addSubnet(ip, Number(prefix), type);
    } else {
      blockList.addAddress(ip, type);
    }
  }
  return blockList;
};

/**
 * Cascade-evaluate IP against secret -> folder -> org allowlists.
 * The most specific non-empty list wins (secret beats folder beats org).
 * Empty/null at every level means no restriction.
 */
export const checkIPAgainstSecretAllowlist = ({
  ipAddress,
  secretAllowedCidrs,
  folderAllowedCidrs,
  orgAllowedCidrs
}: {
  ipAddress: string;
  secretAllowedCidrs?: string[] | null;
  folderAllowedCidrs?: string[] | null;
  orgAllowedCidrs?: string[] | null;
}) => {
  const effective =
    (secretAllowedCidrs && secretAllowedCidrs.length > 0 && secretAllowedCidrs) ||
    (folderAllowedCidrs && folderAllowedCidrs.length > 0 && folderAllowedCidrs) ||
    (orgAllowedCidrs && orgAllowedCidrs.length > 0 && orgAllowedCidrs) ||
    null;

  if (!effective) return;

  const blockList = buildBlockListFromCidrs(effective);
  const { type } = extractIPDetails(ipAddress);
  const allowed = blockList.check(ipAddress, type);

  if (!allowed) {
    throw new ForbiddenRequestError({
      message: "Source IP is not in the secret/folder allowlist for this resource"
    });
  }
};
