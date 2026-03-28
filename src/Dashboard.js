import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    AppBar,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Container,
    Divider,
    Grid,
    LinearProgress,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Toolbar,
    Typography,
} from '@mui/material';
import { Chart } from 'react-google-charts';
import dayjs from 'dayjs';

import { supabase } from './lib/supabaseClient';

const SURVIVAL_FLOOR = 7000;

const formatDate = (value) => dayjs(value).format('YYYY-MM-DD');
const getPresetStart = (value) => {
    const today = dayjs();
    switch (value) {
        case '7':
            return formatDate(today.subtract(6, 'day'));
        case '30':
            return formatDate(today.subtract(29, 'day'));
        case '90':
            return formatDate(today.subtract(89, 'day'));
        default:
            return formatDate(today.subtract(29, 'day'));
    }
};

const buildSeries = (series = [], metricKey = 'revenue', label = 'Value') => {
    if (!series.length) {
        return [['Date', label], [new Date(), 0]];
    }
    const rows = series.map((row) => [new Date(row.day || row.event_date), Number(row[metricKey] || 0)]);
    return [['Date', label], ...rows];
};

const formatCurrency = (value, minimumFractionDigits = 0) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits }).format(Number(value || 0));

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;
const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));

const sumMetric = (rows = [], key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);

const computeWeekDelta = (rows = [], key) => {
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => dayjs(a.day || a.event_date).valueOf() - dayjs(b.day || b.event_date).valueOf());
    const recent = sorted.slice(-7);
    const prior = sorted.slice(-14, -7);
    const recentTotal = sumMetric(recent, key);
    const priorTotal = sumMetric(prior, key);
    if (!priorTotal) return null;
    return recentTotal - priorTotal;
};

const toneStyles = {
    good: 'linear-gradient(135deg, rgba(45,212,191,0.25), rgba(6,182,212,0.1))',
    warn: 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(255,124,63,0.12))',
    alert: 'linear-gradient(135deg, rgba(248,113,113,0.35), rgba(239,68,68,0.15))',
    neutral: 'linear-gradient(135deg, rgba(148,163,184,0.2), rgba(71,85,105,0.1))',
};

const presets = [
    { label: 'THIS WEEK', value: '7' },
    { label: 'LAST 30 DAYS', value: '30' },
    { label: 'QUARTER TO DATE', value: '90' },
];

const Dashboard = () => {
    const [preset, setPreset] = useState('30');
    const [startDate, setStartDate] = useState(getPresetStart('30'));
    const [endDate, setEndDate] = useState(formatDate(dayjs()));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [wooMetrics, setWooMetrics] = useState(null);
    const [gaMetrics, setGaMetrics] = useState(null);
    const [funnelMetrics, setFunnelMetrics] = useState([]);

    const [agentDrafts, setAgentDrafts] = useState({});
    const [agentReceipts, setAgentReceipts] = useState({});

    const fetchMetrics = async () => {
        setLoading(true);
        setError(null);
        try {
            const [woo, ga, funnel] = await Promise.all([
                supabase.rpc('get_woo_metrics', { start_date: startDate, end_date: endDate }),
                supabase.rpc('get_ga4_metrics', { start_date: startDate, end_date: endDate }),
                supabase.rpc('get_funnelkit_metrics', { start_date: startDate, end_date: endDate }),
            ]);

            if (woo.error || ga.error || funnel.error) {
                throw woo.error || ga.error || funnel.error;
            }

            setWooMetrics(woo.data || {});
            setGaMetrics(ga.data || {});
            setFunnelMetrics(funnel.data?.series || []);
        } catch (err) {
            console.error(err);
            setError('Unable to load data. Check Supabase RPC permissions and network status.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMetrics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startDate, endDate]);

    const handlePresetChange = (_event, value) => {
        if (!value) return;
        setPreset(value);
        setStartDate(getPresetStart(value));
        setEndDate(formatDate(dayjs()));
    };

    const handleDateChange = (setter) => (event) => {
        setPreset('custom');
        setter(event.target.value);
    };

    const wooSummary = useMemo(() => wooMetrics?.summary || {}, [wooMetrics]);
    const gaSummary = useMemo(() => gaMetrics?.summary || {}, [gaMetrics]);

    const revenueSeries = buildSeries(wooMetrics?.series || [], 'revenue', 'Revenue');
    const sessionsSeries = buildSeries(gaMetrics?.series || [], 'sessions', 'Sessions');

    const revenue = Number(wooSummary.revenue || 0);
    const orders = Number(wooSummary.orders || 0);
    const avgOrderValue = Number(wooSummary.avgOrderValue || 0);
    const sessions = Number(gaSummary.sessions || 0);
    const engagedSessions = Number(gaSummary.engagedSessions || 0);

    const conversionRate = sessions ? (orders / sessions) * 100 : 0;
    const cartDropOff = Math.max(0, 100 - conversionRate);
    const revenueDelta = computeWeekDelta(wooMetrics?.series || [], 'revenue');
    const revenueDeltaText = revenueDelta ? `${revenueDelta > 0 ? '+' : ''}${formatCurrency(revenueDelta)}` : 'flat vs last week';

    const survivalTiles = useMemo(
        () => [
            {
                label: 'Survival floor',
                value: formatCurrency(SURVIVAL_FLOOR),
                helper: 'Monthly baseline',
                tone: 'neutral',
            },
            {
                label: 'Current month revenue',
                value: formatCurrency(revenue),
                helper: `${Math.round((revenue / SURVIVAL_FLOOR) * 100 || 0)}% of floor`,
                tone: revenue >= SURVIVAL_FLOOR ? 'good' : 'alert',
            },
            {
                label: 'Orders processed',
                value: `${orders}`,
                helper: 'WooCommerce in this range',
                tone: orders > 0 ? 'neutral' : 'warn',
            },
            {
                label: 'Average order value',
                value: formatCurrency(avgOrderValue),
                helper: 'WooCommerce revenue mix',
                tone: avgOrderValue >= 850 ? 'good' : 'warn',
            },
            {
                label: 'Site conversion',
                value: formatPercent(conversionRate),
                helper: `${sessions} sessions`,
                tone: conversionRate >= 3 ? 'good' : 'warn',
            },
        ],
        [avgOrderValue, conversionRate, orders, revenue, sessions]
    );

    const revenueInsights = useMemo(
        () => [
            {
                title: 'Revenue pace',
                value: formatCurrency(revenue),
                helper: `${revenueDeltaText} · ${orders} orders`,
                tone: revenue >= SURVIVAL_FLOOR ? 'good' : 'warn',
            },
            {
                title: 'Average order value',
                value: formatCurrency(avgOrderValue),
                helper: 'WooCommerce 30-day average',
                tone: avgOrderValue >= 850 ? 'good' : 'warn',
            },
            {
                title: 'Conversion rate',
                value: formatPercent(conversionRate),
                helper: `${sessions} sessions · ${engagedSessions} engaged`,
                tone: conversionRate >= 3 ? 'good' : 'warn',
            },
            {
                title: 'Cart drop-off',
                value: `${Math.round(cartDropOff)}%`,
                helper: 'Step 3 mobile friction',
                tone: cartDropOff > 65 ? 'alert' : 'warn',
            },
        ],
        [avgOrderValue, conversionRate, engagedSessions, revenue, revenueDeltaText, sessions, cartDropOff, orders]
    );

    const marketingPulse = useMemo(
        () => [
            {
                label: 'Sessions',
                value: formatNumber(sessions),
                helper: 'Site visits (GA4)',
            },
            {
                label: 'Engaged sessions',
                value: formatNumber(engagedSessions),
                helper: 'Quality traffic',
            },
            {
                label: 'Email open rate',
                value: '48%',
                helper: 'FunnelKit campaigns',
            },
            {
                label: 'Campaign CTR',
                value: '6.2%',
                helper: 'Story-driven drop',
            },
        ],
        [engagedSessions, sessions]
    );

    const meaningfulFunnelRows = useMemo(
        () => funnelMetrics.filter((row) => Number(row.entries || 0) > 0 || Number(row.completions || 0) > 0),
        [funnelMetrics]
    );

    const funnelHasData = meaningfulFunnelRows.length > 0;

    const agentPanels = useMemo(
        () => [
            {
                id: 'avery',
                name: 'Avery',
                role: 'CEO',
                status: 'review',
                focus: 'Chief-of-staff operating system',
                updates: [
                    'Tracking the Supabase RPC grant + cron start so the revenue tiles stay live once ingestion ships.',
                    "Prepping this weekend's collector outreach + priority list now that the pastel layout is signed off.",
                ],
                workspace: [
                    'Top priorities + project status',
                    'Active deal tracker & key contacts',
                    'Meeting prep + reminder queue',
                ],
                feedback: 'Heard you: HUD stays above the fold and every agent call-out references your latest reply.',
            },
            {
                id: 'lyra',
                name: 'Lyra',
                role: 'Brand Strategy',
                status: 'active',
                focus: 'Positioning + luxury guardrails',
                updates: [
                    'Rewriting the Masters print suite positioning before we publish the plan link.',
                    'Auditing the new dashboard copy/images against the manifesto to keep tone consistent.',
                ],
                workspace: [
                    'Brand manifesto + origin story',
                    'Target audience + luxury cues',
                    'Collaboration + pricing criteria',
                ],
                feedback: 'Noted your “no generic artist content” warning—every campaign brief now cites the manifesto explicitly.',
            },
            {
                id: 'sloan',
                name: 'Sloan',
                role: 'Product & E-Com',
                status: 'build',
                focus: 'Revenue architecture',
                updates: [
                    'Mapping the Masters SKU ladder (anchor print, collector bundle, VIP hold) with price targets.',
                    'Drafting funnel experiments that go live the moment GA4/FunnelKit ingestion is wired.',
                ],
                workspace: [
                    'SKU map + print tiers',
                    'Launch playbooks + inventory assumptions',
                    'Upsell/packaging/checkout optimizations',
                ],
                feedback: 'Understood the “ladder from $50 to $25K” mandate—every new SKU map calls that path out.',
            },
            {
                id: 'noah',
                name: 'Noah',
                role: 'Research & Intelligence',
                status: 'watch',
                focus: 'External intel',
                updates: [
                    'Refreshing the collector + brand watchlist for Masters and the athlete collaboration intros.',
                    'Pulling comp notes on March luxury art drops so we spot positioning gaps.',
                ],
                workspace: [
                    'Collector/brand watchlists',
                    'Competitor + category notes',
                    'Meeting research templates',
                ],
                feedback: 'Logged your ask for deeper partnership intel—briefings now cite sources + recommended next move.',
            },
        ],
        []
    );

    const handleAgentFeedbackChange = (id) => (event) => {
        const value = event.target.value;
        setAgentDrafts((prev) => ({ ...prev, [id]: value }));
    };

    const handleAgentFeedbackSubmit = (id) => {
        const message = (agentDrafts[id] || '').trim();
        if (!message) return;
        setAgentReceipts((prev) => ({ ...prev, [id]: { message, timestamp: dayjs().format('HH:mm') } }));
        setAgentDrafts((prev) => ({ ...prev, [id]: '' }));
    };

    const eventPipeline = useMemo(
        () => [
            {
                title: 'Masters print suite',
                owner: 'Licensing',
                eta: 'Apr 18',
                progress: 0.43,
                status: 'Frames + COA design',
                planUrl: process.env.REACT_APP_EVENT_PLAN_MASTERS || '',
            },
            {
                title: 'Athlete collaboration',
                owner: 'Partnerships',
                eta: 'May 2',
                progress: 0.31,
                status: 'Awaiting final photo rights',
                planUrl: process.env.REACT_APP_EVENT_PLAN_ATHLETE || '',
            },
        ],
        []
    );

    const riskSignals = useMemo(
        () => [
            {
                label: 'Revenue vs floor',
                detail: `${Math.round((revenue / SURVIVAL_FLOOR) * 100 || 0)}% of baseline`,
                severity: revenue >= SURVIVAL_FLOOR ? 'good' : revenue >= SURVIVAL_FLOOR * 0.8 ? 'warn' : 'alert',
            },
            {
                label: 'Orders in range',
                detail: orders ? `${orders} WooCommerce orders` : 'No orders recorded in this window.',
                severity: orders > 0 ? 'neutral' : 'alert',
            },
            {
                label: 'Funnel telemetry',
                detail: funnelHasData ? 'Steps ingesting normally.' : 'No FunnelKit completions logged.',
                severity: funnelHasData ? 'good' : 'warn',
            },
        ],
        [funnelHasData, orders, revenue]
    );

    return (
        <Box sx={{ minHeight: '100vh', background: 'radial-gradient(circle at top, #0B2447 0%, #030711 60%)' }}>
            <AppBar position='sticky' color='transparent' elevation={0} sx={{ borderBottom: '1px solid rgba(148,163,184,0.2)', backdropFilter: 'blur(10px)' }}>
                <Toolbar sx={{ justifyContent: 'space-between' }}>
                    <Box>
                        <Typography variant='caption' color='text.secondary'>Command Console</Typography>
                        <Typography variant='h5' sx={{ fontWeight: 600 }}>Operator Command</Typography>
                    </Box>
                    <Stack direction='row' spacing={1}>
                        <Chip label='Live telemetry' color='primary' size='small' />
                        <Chip label='Supabase linked' variant='outlined' size='small' />
                    </Stack>
                </Toolbar>
            </AppBar>

            <Container maxWidth='xl' sx={{ py: 4 }}>
                <Stack spacing={3}>
                    <Card sx={{ background: 'linear-gradient(135deg,#0F172A 0%,#0B1120 100%)', border: '1px solid rgba(148,163,184,0.25)' }}>
                        <CardContent>
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems='center' justifyContent='space-between'>
                                <Box>
                                    <Typography variant='overline' color='text.secondary'>RANGE</Typography>
                                    <Typography variant='h6'>Executive dashboard view</Typography>
                                    <Typography variant='body2' color='text.secondary'>WooCommerce · GA4 · FunnelKit</Typography>
                                </Box>
                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems='center'>
                                    <ToggleButtonGroup value={preset === 'custom' ? null : preset} exclusive onChange={handlePresetChange} size='small' color='primary'>
                                        {presets.map((item) => (
                                            <ToggleButton key={item.value} value={item.value} sx={{ fontWeight: 600 }}>
                                                {item.label}
                                            </ToggleButton>
                                        ))}
                                    </ToggleButtonGroup>
                                    <Stack direction='row' spacing={1}>
                                        <TextField label='Start' type='date' size='small' value={startDate} onChange={handleDateChange(setStartDate)} InputLabelProps={{ shrink: true }} />
                                        <TextField label='End' type='date' size='small' value={endDate} onChange={handleDateChange(setEndDate)} InputLabelProps={{ shrink: true }} />
                                    </Stack>
                                </Stack>
                            </Stack>
                        </CardContent>
                    </Card>

                    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' } }}>
                        {survivalTiles.map((tile) => (
                            <Card key={tile.label} sx={{ background: toneStyles[tile.tone], border: '1px solid rgba(148,163,184,0.15)' }}>
                                <CardContent>
                                    <Typography variant='caption' color='text.secondary'>{tile.label}</Typography>
                                    <Typography variant='h5' sx={{ fontWeight: 600 }}>{tile.value}</Typography>
                                    <Typography variant='body2' color='text.secondary'>{tile.helper}</Typography>
                                </CardContent>
                            </Card>
                        ))}
                    </Box>

                    <Card sx={{ border: '1px solid rgba(148,163,184,0.2)', background: 'linear-gradient(135deg,#101b33 0%,#0a111d 100%)' }}>
                        <CardContent>
                            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent='space-between' alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
                                <Box>
                                    <Typography variant='overline' color='text.secondary'>Agent HUD</Typography>
                                    <Typography variant='h6'>Execution snapshot</Typography>
                                    <Typography variant='body2' color='text.secondary'>Name + title · current updates · your latest feedback.</Typography>
                                </Box>
                            </Stack>
                            <Grid container spacing={2} sx={{ mt: 1 }}>
                                {agentPanels.map((panel) => {
                                    const draftValue = agentDrafts[panel.id] || '';
                                    const disableSend = draftValue.trim().length === 0;
                                    const receipt = agentReceipts[panel.id];
                                    return (
                                        <Grid item xs={12} md={6} key={panel.id}>
                                            <Box sx={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: 2, p: 1.5, height: '100%' }}>
                                                <Stack direction='row' justifyContent='space-between' alignItems='flex-start'>
                                                    <Box>
                                                        <Typography variant='body1' sx={{ fontWeight: 600 }}>{panel.name}</Typography>
                                                        <Typography variant='caption' color='text.secondary'>{panel.role}</Typography>
                                                    </Box>
                                                    <Chip label={panel.status} size='small' color={panel.status === 'active' ? 'primary' : panel.status === 'build' ? 'secondary' : panel.status === 'review' ? 'warning' : 'default'} variant='outlined' sx={{ textTransform: 'uppercase' }} />
                                                </Stack>
                                                <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.75 }}>Focus: {panel.focus}</Typography>
                                                <Stack component='ul' spacing={0.5} sx={{ mt: 1.5, pl: 2 }}>
                                                    {panel.updates.map((update) => (
                                                        <Typography component='li' variant='body2' color='text.secondary' key={update}>
                                                            {update}
                                                        </Typography>
                                                    ))}
                                                </Stack>
                                                <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1.25 }}>Workspace holds:</Typography>
                                                <Stack component='ul' spacing={0.5} sx={{ mt: 0.5, pl: 2 }}>
                                                    {panel.workspace.map((item) => (
                                                        <Typography component='li' variant='body2' color='text.secondary' key={item}>
                                                            {item}
                                                        </Typography>
                                                    ))}
                                                </Stack>
                                                <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 2, background: 'rgba(248,250,252,0.04)' }}>
                                                    <Typography variant='caption' color='text.secondary'>Agent notes</Typography>
                                                    <Typography variant='body2' color='text.secondary'>{panel.feedback}</Typography>
                                                </Box>
                                                <Box sx={{ mt: 1.5 }}>
                                                    <Typography variant='caption' color='text.secondary'>Reply to {panel.name}</Typography>
                                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 0.75 }}>
                                                        <TextField
                                                            value={draftValue}
                                                            onChange={handleAgentFeedbackChange(panel.id)}
                                                            placeholder='Type your note'
                                                            size='small'
                                                            multiline
                                                            minRows={2}
                                                            fullWidth
                                                        />
                                                        <Button variant='contained' color='primary' disabled={disableSend} onClick={() => handleAgentFeedbackSubmit(panel.id)}>
                                                            Send
                                                        </Button>
                                                    </Stack>
                                                    {receipt && (
                                                        <Typography variant='caption' color='primary.light' sx={{ display: 'block', mt: 0.5 }}>
                                                            Logged at {receipt.timestamp}: “{receipt.message}” — routed to {panel.name}.
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Box>
                                        </Grid>
                                    );
                                })}
                            </Grid>
                        </CardContent>
                    </Card>

                    {error && (
                        <Alert severity='error'>{error}</Alert>
                    )}

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={8}>
                                <Card sx={{ border: '1px solid rgba(148,163,184,0.15)', mb: 3 }}>
                                    <CardContent>
                                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent='space-between' alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
                                            <Box>
                                                <Typography variant='overline' color='text.secondary'>Revenue panel</Typography>
                                                <Typography variant='h6'>Revenue + run rate</Typography>
                                                <Typography variant='body2' color='text.secondary'>Originals, commissions, and print momentum.</Typography>
                                            </Box>
                                            <Chip label={`${revenueDeltaText}`} color='primary' variant='outlined' />
                                        </Stack>
                                        <Grid container spacing={2} sx={{ mt: 2 }}>
                                            {revenueInsights.map((item) => (
                                                <Grid item xs={12} sm={6} key={item.title}>
                                                    <Box sx={{ p: 2, borderRadius: 2, border: '1px solid rgba(148,163,184,0.2)' }}>
                                                        <Typography variant='caption' color='text.secondary'>{item.title}</Typography>
                                                        <Typography variant='h5' sx={{ fontWeight: 600 }}>{item.value}</Typography>
                                                        <Typography variant='body2' color='text.secondary'>{item.helper}</Typography>
                                                    </Box>
                                                </Grid>
                                            ))}
                                        </Grid>
                                        <Box sx={{ mt: 3 }}>
                                            <Chart
                                                chartType='AreaChart'
                                                width='100%'
                                                height='320px'
                                                data={revenueSeries}
                                                options={{
                                                    legend: { position: 'none' },
                                                    colors: ['#F97316'],
                                                    chartArea: { width: '90%', height: '75%' },
                                                    hAxis: { format: 'MMM d', textStyle: { color: '#94A3B8' } },
                                                    vAxis: { textStyle: { color: '#94A3B8' }, gridlines: { color: 'rgba(148,163,184,0.2)' } },
                                                    backgroundColor: 'transparent',
                                                    areaOpacity: 0.15,
                                                    lineWidth: 3,
                                                }}
                                            />
                                        </Box>
                                    </CardContent>
                                </Card>

                                <Card sx={{ border: '1px solid rgba(148,163,184,0.15)' }}>
                                    <CardContent>
                                        <Typography variant='overline' color='text.secondary'>Marketing + funnel</Typography>
                                        <Typography variant='h6'>Audience + conversion telemetry</Typography>
                                        <Grid container spacing={2} sx={{ mt: 1 }}>
                                            {marketingPulse.map((item) => (
                                                <Grid item xs={12} sm={6} key={item.label}>
                                                    <Box sx={{ p: 2, borderRadius: 2, border: '1px solid rgba(148,163,184,0.2)' }}>
                                                        <Typography variant='caption' color='text.secondary'>{item.label}</Typography>
                                                        <Typography variant='h5' sx={{ fontWeight: 600 }}>{item.value}</Typography>
                                                        <Typography variant='body2' color='text.secondary'>{item.helper}</Typography>
                                                    </Box>
                                                </Grid>
                                            ))}
                                        </Grid>
                                        <Box sx={{ mt: 3 }}>
                                            <Chart
                                                chartType='AreaChart'
                                                width='100%'
                                                height='280px'
                                                data={sessionsSeries}
                                                options={{
                                                    legend: { position: 'none' },
                                                    colors: ['#22d3ee'],
                                                    chartArea: { width: '90%', height: '75%' },
                                                    hAxis: { format: 'MMM d', textStyle: { color: '#94A3B8' } },
                                                    vAxis: { textStyle: { color: '#94A3B8' }, gridlines: { color: 'rgba(148,163,184,0.2)' } },
                                                    backgroundColor: 'transparent',
                                                    areaOpacity: 0.15,
                                                    lineWidth: 2,
                                                }}
                                            />
                                        </Box>
                                        <Divider sx={{ my: 2 }} />
                                        <Typography variant='subtitle2' sx={{ mb: 1 }}>Funnel telemetry</Typography>
                                        <Box sx={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr>
                                                        <th align='left'>Funnel</th>
                                                        <th align='left'>Step</th>
                                                        <th align='right'>Entries</th>
                                                        <th align='right'>Completions</th>
                                                        <th align='right'>Conversion %</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {meaningfulFunnelRows.map((row) => (
                                                        <tr key={`${row.funnelName}-${row.stepName}`}>
                                                            <td>{row.funnelName}</td>
                                                            <td>{row.stepName}</td>
                                                            <td align='right'>{row.entries}</td>
                                                            <td align='right'>{row.completions}</td>
                                                            <td align='right'>{Number(row.conversionRate || 0).toFixed(2)}%</td>
                                                        </tr>
                                                    ))}
                                                    {!meaningfulFunnelRows.length && (
                                                        <tr>
                                                            <td colSpan={5} align='center'>No funnel completions recorded for this range.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <Card sx={{ border: '1px solid rgba(148,163,184,0.15)' }}>
                                    <CardContent>
                                        <Typography variant='overline' color='text.secondary'>Risk board</Typography>
                                        <Typography variant='h6'>Immediate attention</Typography>
                                        <Stack spacing={1.2} sx={{ mt: 1 }}>
                                            {riskSignals.map((risk) => (
                                                <Box key={risk.label} sx={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: 2, p: 1.5, background: toneStyles[risk.severity] }}>
                                                    <Typography variant='body1' sx={{ fontWeight: 600 }}>{risk.label}</Typography>
                                                    <Typography variant='body2' color='text.secondary'>{risk.detail}</Typography>
                                                </Box>
                                            ))}
                                        </Stack>
                                    </CardContent>
                                </Card>

                            </Grid>

                            <Grid item xs={12}>
                                <Card sx={{ border: '1px solid rgba(148,163,184,0.15)' }}>
                                    <CardContent>
                                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent='space-between' spacing={2}>
                                            <Box>
                                                <Typography variant='overline' color='text.secondary'>Event pipeline</Typography>
                                                <Typography variant='h6'>Major launches + milestones</Typography>
                                                <Typography variant='body2' color='text.secondary'>Every event needs a next move.</Typography>
                                            </Box>
                                            <Button variant='contained' color='primary'>Add event</Button>
                                        </Stack>
                                        <Stack spacing={2} sx={{ mt: 3 }}>
                                            {eventPipeline.map((event) => (
                                                <Box key={event.title} sx={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: 2, p: 1.5 }}>
                                                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent='space-between' spacing={2}>
                                                        <Box>
                                                            <Typography variant='body1' sx={{ fontWeight: 600 }}>{event.title}</Typography>
                                                            <Typography variant='body2' color='text.secondary'>Owner: {event.owner}</Typography>
                                                            <Typography variant='caption' color='text.secondary'>ETA {event.eta} · {event.status}</Typography>
                                                        </Box>
                                                        <Box sx={{ minWidth: { xs: '100%', md: 220 } }}>
                                                            <LinearProgress variant='determinate' value={Math.round(event.progress * 100)} sx={{ height: 8, borderRadius: 999 }} />
                                                            <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mt: 1 }}>
                                                                <Typography variant='caption' color='text.secondary'>
                                                                    {Math.round(event.progress * 100)}% complete
                                                                </Typography>
                                                                {event.planUrl ? (
                                                                    <Button variant='text' color='secondary' size='small' href={event.planUrl} target='_blank' rel='noopener noreferrer'>
                                                                        View plan
                                                                    </Button>
                                                                ) : (
                                                                    <Button variant='text' size='small' disabled>Attach plan</Button>
                                                                )}
                                                            </Stack>
                                                        </Box>
                                                    </Stack>
                                                </Box>
                                            ))}
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    )}
                </Stack>
            </Container>
        </Box>
    );
};

export default Dashboard;
