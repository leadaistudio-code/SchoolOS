'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Globe, Plus, Trash, ShieldAlert, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'

type Domain = {
  id: string
  host: string
  verified: boolean
  isPrimary: boolean
  verifyToken: string | null
  createdAt: string
}

export function DomainManager({ initialDomains }: { initialDomains: Domain[] }) {
  const router = useRouter()
  const toast = useToast()
  const [host, setHost] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  const [verifying, setVerifying] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const [settingPrimary, setSettingPrimary] = React.useState<string | null>(null)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)
    try {
      const res = await fetch('/api/v1/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Failed to add domain')
      
      toast.push({ tone: 'success', title: 'Domain added', description: 'Please complete the DNS setup.' })
      setHost('')
      router.refresh()
    } catch (err: any) {
      toast.push({ tone: 'error', title: 'Error', description: err.message })
    } finally {
      setAdding(false)
    }
  }

  const handleVerify = async (id: string) => {
    setVerifying(id)
    try {
      const res = await fetch(`/api/v1/domains/${id}/verify`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Verification failed')
      
      toast.push({ tone: 'success', title: 'Verified', description: 'Domain is now verified and active.' })
      router.refresh()
    } catch (err: any) {
      toast.push({ tone: 'error', title: 'Verification failed', description: err.message })
    } finally {
      setVerifying(null)
    }
  }

  const handleSetPrimary = async (id: string) => {
    setSettingPrimary(id)
    try {
      const res = await fetch(`/api/v1/domains/${id}/primary`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Could not set primary domain')
      
      toast.push({ tone: 'success', title: 'Primary set', description: 'This domain is now the primary address.' })
      router.refresh()
    } catch (err: any) {
      toast.push({ tone: 'error', title: 'Error', description: err.message })
    } finally {
      setSettingPrimary(null)
    }
  }

  const handleRemove = async (id: string) => {
    if (!confirm('Are you sure you want to remove this domain?')) return
    
    setRemoving(id)
    try {
      const res = await fetch(`/api/v1/domains/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Could not remove domain')
      
      toast.push({ tone: 'success', title: 'Domain removed' })
      router.refresh()
    } catch (err: any) {
      toast.push({ tone: 'error', title: 'Error', description: err.message })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] items-start">
      <Card>
        <CardHeader>
          <CardTitle>Your Domains</CardTitle>
          <CardDescription>
            Custom domains you have added to your portal. Traffic to these addresses will be routed to your school.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialDomains.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-line rounded-lg bg-surface">
              <Globe className="mx-auto size-8 text-ink-muted mb-3" />
              <p className="text-sm font-medium text-ink">No custom domains</p>
              <p className="text-xs text-ink-subtle mt-1 max-w-sm mx-auto">
                Add a custom domain on the right to serve your portal from your own address.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {initialDomains.map((domain) => (
                <div key={domain.id} className="border border-line rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between bg-surface p-4 border-b border-line">
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-[15px]">{domain.host}</p>
                      {domain.isPrimary && <Badge tone="neutral">Primary</Badge>}
                      {domain.verified ? (
                        <Badge tone="success" className="gap-1.5 pl-1.5">
                          <CheckCircle2 className="size-3" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge tone="warning" className="gap-1.5 pl-1.5">
                          <ShieldAlert className="size-3" />
                          Unverified
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {domain.verified && !domain.isPrimary && (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={settingPrimary === domain.id}
                          onClick={() => handleSetPrimary(domain.id)}
                        >
                          <Star className="size-4" />
                          Set Primary
                        </Button>
                      )}
                      {!domain.isPrimary && (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={removing === domain.id}
                          onClick={() => handleRemove(domain.id)}
                          className="text-danger hover:text-danger"
                        >
                          <Trash className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {!domain.verified && (
                    <div className="p-4 bg-yellow-50/50">
                      <p className="text-sm font-medium text-amber-900 mb-2">DNS Verification Required</p>
                      <p className="text-xs text-amber-800 mb-4">
                        To prove you own this domain, please add the following TXT record to your DNS provider. 
                        It may take a few hours for the changes to propagate.
                      </p>

                      <div className="border border-amber-200 rounded bg-white overflow-hidden mb-4">
                        <Table>
                          <THead>
                            <TR className="bg-amber-50">
                              <TH className="py-2 text-xs">Type</TH>
                              <TH className="py-2 text-xs">Host / Name</TH>
                              <TH className="py-2 text-xs">Value</TH>
                            </TR>
                          </THead>
                          <TBody>
                            <TR>
                              <TD className="py-2 font-mono text-xs">TXT</TD>
                              <TD className="py-2 font-mono text-xs">_schoolos-challenge</TD>
                              <TD className="py-2 font-mono text-xs break-all">{domain.verifyToken}</TD>
                            </TR>
                          </TBody>
                        </Table>
                      </div>

                      <div className="border border-amber-200 rounded bg-white overflow-hidden mb-4">
                        <p className="text-xs text-amber-800 px-4 pt-3 mb-1">
                          Additionally, add a CNAME record pointing to our servers to route traffic:
                        </p>
                        <Table>
                          <THead>
                            <TR className="bg-amber-50">
                              <TH className="py-2 text-xs">Type</TH>
                              <TH className="py-2 text-xs">Host / Name</TH>
                              <TH className="py-2 text-xs">Value</TH>
                            </TR>
                          </THead>
                          <TBody>
                            <TR>
                              <TD className="py-2 font-mono text-xs">CNAME</TD>
                              <TD className="py-2 font-mono text-xs">@ (or subdomain)</TD>
                              <TD className="py-2 font-mono text-xs">cname.schoolos.dev</TD>
                            </TR>
                          </TBody>
                        </Table>
                      </div>

                      <Button
                        size="sm"
                        loading={verifying === domain.id}
                        onClick={() => handleVerify(domain.id)}
                      >
                        Verify Now
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Domain</CardTitle>
          <CardDescription>Register a new custom domain.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-4">
            <Field label="Domain Name" htmlFor="host" hint="e.g. erp.school.com or portal.academy.edu">
              <Input
                id="host"
                placeholder="erp.school.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" loading={adding} className="w-full">
              <Plus className="size-4" />
              Add Domain
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
