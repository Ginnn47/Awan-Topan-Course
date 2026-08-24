import { useEffect, useState } from "react";
import { subscribeDataChanges } from "../services/dataStore.js";

export default function useDataRevision(domains = []) {
  const [revision, setRevision] = useState(0);
  const domainKey = domains.join("|");

  useEffect(() => subscribeDataChanges(() => {
    setRevision((current) => current + 1);
  }, domains), [domainKey]);

  return revision;
}

