export interface Template {
    active_user_count: number;
    active_version_id: string;
    activity_bump_ms: number;
    allow_user_autostart: boolean;
    allow_user_autostop: boolean;
    allow_user_cancel_workspace_jobs: boolean;
    autostart_requirement: {
        days_of_week: string[];
    };
    autostop_requirement: {
        days_of_week: string[];
        weeks: number;
    };
    build_time_stats: {
        [key: string]: {
            p50: number;
            p95: number;
        };
    };
    created_at: string;
    created_by_id: string;
    created_by_name: string;
    default_ttl_ms: number;
    deprecated: boolean;
    deprecation_message: string;
    description: string;
    display_name: string;
    failure_ttl_ms: number;
    icon: string;
    id: string;
    max_port_share_level: string;
    name: string;
    organization_display_name: string;
    organization_icon: string;
    organization_id: string;
    organization_name: string;
    provisioner: string;
    require_active_version: boolean;
    time_til_dormant_autodelete_ms: number;
    time_til_dormant_ms: number;
    updated_at: string;
}

export interface Workspace {
    id: string;
    name: string;
    owner_id: string;
    owner_name: string;
    ttl_ms: number;
    automatic_updates: string;
    autostart_schedule: string;
    created_at: string;
    deleting_at: string;
    dormant_at: string;
    updated_at: string;
    last_used_at: string;
    next_start_at: string;
    organization_id: string;
    organization_name: string;
    outdated: boolean;
    template_active_version_id: string;
    template_id: string;
    template_name: string;
    template_display_name: string;
    template_require_active_version: string;
    allow_renames: boolean;
    favorite: boolean;
    health: {
        failing_agents: string[];
        healthy: boolean;
    };
    latest_build: {
        build_number: number;
        created_at: string;
        daily_cost: number;
        deadline: string;
        id: string;
        initiator_id: string;
        initiator_name: string;
        job: {
            canceled_at: string;
            completed_at: string;
            created_at: string;
            error: string;
            error_code: string;
            file_id: string;
            id: string;
            queue_position: number;
            queue_size: number;
            started_at: string;
            status: string;
            tags: {
                [key: string]: string;
            };
            worker_id: string;
        };
        matched_provisioners: {
            available: number;
            count: number;
            most_recently_seen: string;
        };
    };
}

export interface WorkspacesResponse {
    count: number;
    workspaces: Workspace[];
}
