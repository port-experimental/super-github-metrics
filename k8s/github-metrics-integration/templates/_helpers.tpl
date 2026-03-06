{{/*
Expand the name of the chart.
*/}}
{{- define "github-metrics.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "github-metrics.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "github-metrics.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "github-metrics.labels" -}}
helm.sh/chart: {{ include "github-metrics.chart" . }}
{{ include "github-metrics.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Thomson Reuters annotations (using dots instead of colons for K8s compatibility)
*/}}
{{- define "github-metrics.trAnnotations" -}}
{{- if .Values.trLabels }}
tr.application-asset-insight-id: {{ .Values.trLabels.applicationAssetInsightId | quote }}
tr.resource-owner: {{ .Values.trLabels.resourceOwner | quote }}
{{- end }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "github-metrics.selectorLabels" -}}
app.kubernetes.io/name: {{ include "github-metrics.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app: {{ include "github-metrics.fullname" . }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "github-metrics.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "github-metrics.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the secret name
*/}}
{{- define "github-metrics.secretName" -}}
{{- if .Values.secretProviderClass.enabled }}
{{- .Values.secretProviderClass.secretName | default (printf "%s-secrets" (include "github-metrics.fullname" .)) }}
{{- else }}
{{- include "github-metrics.fullname" . }}-secrets
{{- end }}
{{- end }}

{{/*
Create the configmap name
*/}}
{{- define "github-metrics.configMapName" -}}
{{- include "github-metrics.fullname" . }}-config
{{- end }}

{{/*
Container image
*/}}
{{- define "github-metrics.image" -}}
{{- printf "%s:%s" .Values.image.repository .Values.image.tag }}
{{- end }}
