// packages/metrics/src/index.ts
import { Gauge, Counter, Histogram, Registry } from 'prom-client'
export const registry = new Registry()
export const createGauge = (name:string,help:string,labelNames:string[]=[]) =>
  new Gauge({name,help,labelNames,registers:[registry]})
export const createCounter = (name:string,help:string,labelNames:string[]=[]) =>
  new Counter({name,help,labelNames,registers:[registry]})
export const createHistogram = (name:string,help:string,labelNames:string[]=[],buckets?:number[]) =>
  new Histogram({name,help,labelNames,buckets,registers:[registry]})
