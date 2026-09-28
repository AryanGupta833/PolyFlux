// Sample logs and the five demo scenarios from the architecture document (§17)

export const SAMPLES: { label: string; format: string; text: string }[] = [
  { label: "Cisco ASA (syslog)", format: "syslog", text: `<164>Sep 28 10:31:21 ASA01 : %ASA-4-106023: Deny tcp src outside:203.0.113.45/51234 dst inside:10.0.1.20/443 by access-group "outside_in" [0x0, 0x0]` },
  { label: "Fortinet FortiGate (kv)", format: "kv", text: `date=2026-09-28 time=10:31:21 devname="FW02" devid="FGT60E" logid="0000000013" type="traffic" subtype="forward" level="warning" srcip=10.0.1.5 srcport=51234 dstip=8.8.8.8 dstport=443 proto=6 action="deny" policyid=17 policyname="block-dns-egress" threatscore=83` },
  { label: "Palo Alto (CEF)", format: "cef", text: `CEF:0|Palo Alto Networks|PAN-OS|10.1|THREAT|Spyware detected|8|src=10.0.2.14 dst=198.51.100.7 spt=49211 dpt=8080 proto=TCP act=blocked suser=alice rt=1790591481000 dvchost=PA-EDGE` },
  { label: "QRadar (LEEF)", format: "leef", text: "LEEF:1.0|IBM|QRadar|7.5|Login|src=192.0.2.10\tdst=10.0.0.5\tdstPort=22\tproto=tcp\tusrName=bob\taction=failed\tsev=5\tdevName=QR-01" },
  { label: "Proxy (JSON, unknown)", format: "json", text: `{"timestamp":"2026-09-28T10:31:21Z","host":"proxy-01","client_ip":"10.0.3.9","dest_host":"example.com","dest_port":443,"verdict":"allow","bytes":5120}` },
  { label: "VPN (CSV, unknown)", format: "csv", text: `time,hostname,user,client,port,result\n2026-09-28 10:40:00,vpn-gw,carol,198.51.100.23,443,success\n2026-09-28 10:41:00,vpn-gw,dave,198.51.100.24,443,failure` },
  { label: "Linux (RFC 5424)", format: "syslog", text: `<86>1 2026-09-28T10:31:21.003Z router-7 sshd 2211 ID47 - Accepted publickey for ops from 10.0.9.4 port 50222` },
];

export const SCENARIOS: { id: number; title: string; description: string; text: string }[] = [
  {
    id: 1, title: "Known source",
    description: "Send a Cisco ASA log → detected as syslog, cisco-asa-parser, fully normalized event.",
    text: SAMPLES[0]?.text ?? "",
  },
  {
    id: 2, title: "Unknown source",
    description: "Send an unknown key=value format → RAW_ONLY + mapping proposal. Approve it on the Proposals page; earlier events are reprocessed from raw.",
    text: `2026-09-28 10:31:21 FW01 SRC=10.0.1.5 DST=8.8.8.8 PROTO=TCP DPT=443 ACT=DENY\n2026-09-28 10:31:25 FW01 SRC=10.0.1.6 DST=9.9.9.9 PROTO=UDP DPT=53 ACT=ALLOW`,
  },
  {
    id: 3, title: "Lineage",
    description: "Open any normalized event and click network.source_ip → source field, parser, mapping entry, and highlighted span in the raw event.",
    text: SAMPLES[1]?.text ?? "",
  },
  {
    id: 4, title: "Schema drift",
    description: "Same FW01 source with renamed fields (source=, destination=, decision=). Run after approving scenario 2 → drift report + suggested mapping v2.",
    text: `2026-09-28 10:45:02 FW01 source=10.0.1.7 destination=1.1.1.1 PROTO=UDP DPT=53 decision=DENY`,
  },
  {
    id: 5, title: "Attack chain → graph",
    description: "Port scan → denies → VPN auth failures → success → suspicious outbound connection. Builds alerts and the correlation graph.",
    text: [
      ...[22, 23, 80, 443, 3389, 8080].map((p, i) => `<164>Sep 28 10:50:0${i} ASA01 : %ASA-4-106023: Deny tcp src outside:203.0.113.66/4${1000 + i} dst inside:10.0.1.20/${p} by access-group "outside_in" [0x0, 0x0]`),
      ...[1, 2, 3, 4].map((i) => `date=2026-09-28 time=10:52:0${i} devname="FW02" devid="FGT60E" logid="0101039426" type="event" subtype="vpn" level="alert" action="ssl-login-fail" user="admin" remip=203.0.113.66 reason="sslvpn_login_permission_denied"`),
      `date=2026-09-28 time=10:53:10 devname="FW02" devid="FGT60E" logid="0101039943" type="event" subtype="vpn" level="notice" action="tunnel-up" user="admin" remip=203.0.113.66`,
      `<166>Sep 28 10:55:42 ASA01 : %ASA-6-302013: Built outbound TCP connection 99127 for outside:203.0.113.66/4444 (203.0.113.66/4444) to inside:10.0.1.50/51000 (10.0.1.50/51000)`,
    ].join("\n"),
  },
];
