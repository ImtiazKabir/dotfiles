// @ts-nocheck

export const IS_PRODUCTION = true

export const SERVER_API_URL =
  IS_PRODUCTION === true
    ? 'https://swiftread-ext-api.herokuapp.com/api/'
    : 'http://localhost:8081/api/'

export const APP_URL =
  IS_PRODUCTION === true ? 'https://app.swiftread.com' : 'http://localhost:3000'

export const APP_API_URL =
  IS_PRODUCTION === true
    ? 'https://swiftread-app-api-4f19e2bc1fde.herokuapp.com'
    : 'http://localhost:8888'

export const SUPABASE_URL =
  IS_PRODUCTION === true
    ? 'https://uclskwetrppbodtcelol.supabase.co'
    : 'http://localhost:54321'

export const SUPABASE_ANON_KEY =
  IS_PRODUCTION === true
    ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjbHNrd2V0cnBwYm9kdGNlbG9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE2Njc3ODI1NDEsImV4cCI6MTk4MzM1ODU0MX0.FMoZFrDpQB6oGht9VTVcdS695SUoi-NpzawahVrLae0'
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
