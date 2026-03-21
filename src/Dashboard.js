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
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Toolbar,
    Typography,
} from '@mui/material';
import { Chart } from 'react-google-charts';
import dayjs from 'dayjs';

import { supabase } from './lib/supabaseClient';

const navSections = [
    { title: 'Chat', items: [{ key: 'chat', label: 'Chat' }] },
    {
        title: 'Control',
        items: [
            { key: 'overview', label: 'Overview' },
            { key: 'channels', label: 'Channels' },
            { key: 'instances', label: 'Instances' },
            { key: 'sessions', label: 'Sessions' },
            { key: 'usage', label: 'Usage' },
            { key: 'cron', label: 'Cron jobs' },
        ],
    },
    { title: 'Agents', items: [{ key: 'agents', label: 'Agents' }, { key: 'skills', label: 'Skills' }, { key: 'nodes', label: 'Nodes' }] },
    { title: 'Settings', items: [{ key: 'config', label: 'Config' }, { key: 'debug', label: 'Debug' }, { key: 'logs', label: 'Logs' }] },
    { title: 'Resources', items: [{ key: 'docs', label: 'Docs' }] },
];

const viewMeta = {
    overview: { title: 'Overview', subtitle: 'Gateway status, entry points, and a fast health read.' },
    channels: { title: 'Channels', subtitle: 'Connected inbound/outbound surfaces.' },
    instances: { title: 'Instances', subtitle: 'Gateway machines, versions, and rolling updates.' },
    sessions: { title: 'Sessions', subtitle: 'Live conversations, tool calls, and transcript health.' },
    usage: { title: 'Usage', subtitle: 'Token consumption, spend, and routing mix.' },
    cron: { title: 'Cron jobs', subtitle: 'Automation cadence and run history.' },
    agents: { title: 'Agents', subtitle: 'Personas, roles, and orchestration rules.' },
    skills: { title: 'Skills', subtitle: 'Reusable automation packs.' },
    nodes: { title: 'Nodes', subtitle: 'Paired devices and approvals.' },
    config: { title: 'Config', subtitle: 'Keys, endpoints, and environment toggles.' },
    debug: { title: 'Debug', subtitle: 'Logs, traces, and incidents.' },
    logs: { title: 'Logs', subtitle: 'Gateway + agent log tail.' },
    docs: { title: 'Docs', subtitle: 'Reference material for the stack.' },
    chat: { title: 'Chat', subtitle: 'Primary conversational surface.' },
};

const presets = [
    { label: 'THIS WEEK', value: '7' },
    { label: 'LAST 30 DAYS', value: '30' },
    { label: 'QUARTER TO DATE', value: '90' },
];

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

const Dashboard = () => {
    const [activeView, setActiveView] = useState('overview');
    const [preset, setPreset] = useState('30');
    const [startDate, setStartDate] = useState(getPresetStart('30'));
    const [endDate, setEndDate] = useState(formatDate(dayjs()));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [wooMetrics, setWooMetrics] = useState(null);
    const [gaMetrics, setGaMetrics] = useState(null);
    const [funnelMetrics, setFunnelMetrics] = useState([]);
    const [activeChart, setActiveChart] = useState('revenue');

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

    const revenueGoal = 120000;
    const revenueVsGoal = revenueGoal ? Math.round((revenue / revenueGoal) * 100) : 0;
    const conversionRate = sessions ? (orders / sessions) * 100 : 0;
    const cartDropOff = Math.max(0, 100 - conversionRate);
    const revenueDelta = computeWeekDelta(wooMetrics?.series || [], 'revenue');
    const revenueAtRisk = Math.max(0, revenue * (cartDropOff / 100));

    const summaryCards = useMemo(
        () => [
            {
                title: 'Revenue pace',
                value: formatCurrency(revenue),
                helper: `${revenueVsGoal}% to $${revenueGoal.toLocaleString()} goal`,
                change: revenueDelta ? `${revenueDelta > 0 ? '+' : ''}${formatCurrency(revenueDelta)}` : 'WooCommerce live orders',
                status: revenueVsGoal >= 75 ? 'ON PACE' : revenueVsGoal >= 50 ? 'WATCH' : 'AT RISK',
                statusColor: revenueVsGoal >= 75 ? 'success' : revenueVsGoal >= 50 ? 'warning' : 'error',
            },
            {
                title: 'Conversion rate',
                value: formatPercent(conversionRate),
                helper: `Checkout completion ${formatPercent(conversionRate)}`,
                change: `${orders} orders in range`,
                status: conversionRate >= 3 ? 'FOCUS AREA' : 'AT RISK',
                statusColor: conversionRate >= 3 ? 'info' : 'error',
            },
            {
                title: 'Average order value',
                value: formatCurrency(avgOrderValue),
                helper: '30-day WooCommerce average',
                change: `${orders} orders · ${formatCurrency(avgOrderValue, 2)} AOV`,
                status: avgOrderValue >= 750 ? 'ON PACE' : 'WATCH',
                statusColor: avgOrderValue >= 750 ? 'success' : 'warning',
            },
            {
                title: 'Pipeline at risk',
                value: formatCurrency(revenueAtRisk),
                helper: `${funnelMetrics.filter((row) => Number(row.conversionRate || 0) < 25).length} slow steps`,
                change: '$18K tied to mobile checkout',
                status: revenueAtRisk > 30000 ? 'WATCH CLOSELY' : 'STABLE',
                statusColor: revenueAtRisk > 30000 ? 'warning' : 'success',
            },
        ],
        [avgOrderValue, conversionRate, funnelMetrics, orders, revenue, revenueAtRisk, revenueDelta, revenueGoal, revenueVsGoal]
    );

    const webPerfMetrics = [
        { label: 'CWV QUALITY SCORE', value: `${Math.round((engagedSessions / Math.max(sessions || 1, 1)) * 100)}%`, context: `${engagedSessions}/${sessions || 0} page-device combos passing` },
        { label: 'CHECKOUT COMPLETION', value: formatPercent(conversionRate), context: `${orders} orders · goal 3.5%+` },
        { label: 'CART DROP-OFF', value: `${Math.round(cartDropOff)}%`, context: '+5 pts vs 30d avg' },
        { label: 'REVENUE AT RISK', value: formatCurrency(revenueAtRisk), context: 'Slow PDPs + checkout step 3' },
    ];

    const meta = viewMeta[activeView] || viewMeta.overview;

    const renderPlaceholder = () => (
        <Card>
            <CardContent>
                <Typography variant='subtitle1' sx={{ mb: 1 }}>This hosted mirror focuses on the executive overview.</Typography>
                <Typography variant='body2' color='text.secondary'>Use the native OpenClaw desktop app or the local console at 127.0.0.1:18789 for the full {meta.title} surface. The data behind these tabs is unchanged—we’re just exposing the revenue dashboard here.</Typography>
            </CardContent>
        </Card>
    );

    const renderOverview = () => (
        <>
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} md={8}>
                    <Card sx={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
                        <CardContent sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                            <Box>
                                <Typography variant='subtitle2' sx={{ color: '#b91c1c', fontWeight: 600 }}>
                                    Update available: v2026.3.13 (running v2026.3.12)
                                </Typography>
                                <Typography variant='body2' color='text.secondary'>Gateway status, entry points, and heartbeat feed.</Typography>
                            </Box>
                            <Button variant='contained' color='error' size='small'>Update now</Button>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card sx={{ background: '#fef2f2', border: '1px solid #fecaca', height: '100%' }}>
                        <CardContent>
                            <Typography variant='overline' sx={{ color: '#b91c1c', letterSpacing: 1 }}>Alert</Typography>
                            <Typography variant='subtitle2' sx={{ fontWeight: 600, color: '#b91c1c' }}>event gap detected</Typography>
                            <Typography variant='body2' color='text.secondary'>expected seq 59201, got 59204 · refresh recommended</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Card sx={{ mb: 4 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 3 }}>
                        <Box>
                            <Typography variant='overline' color='text.secondary'>MOCK DATA</Typography>
                            <Typography variant='h4' sx={{ fontWeight: 600 }}>Executive dashboard</Typography>
                            <Typography variant='body2' color='text.secondary'>Mocked data preview of the revenue command center.</Typography>
                        </Box>
                        <Stack spacing={1} alignItems='flex-end'>
                            <Chip label='Last sync just now' size='small' variant='outlined' />
                            <Typography variant='caption' color='text.secondary'>{`${dayjs(startDate).format('MMM D')} – ${dayjs(endDate).format('MMM D, YYYY')}`}</Typography>
                        </Stack>
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                        <ToggleButtonGroup value={preset === 'custom' ? null : preset} exclusive onChange={handlePresetChange} size='small'>
                            {presets.map((item) => (
                                <ToggleButton key={item.value} value={item.value} sx={{ fontWeight: 600 }}>
                                    {item.label}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <TextField label='Start' type='date' size='small' value={startDate} onChange={handleDateChange(setStartDate)} InputLabelProps={{ shrink: true }} />
                        <TextField label='End' type='date' size='small' value={endDate} onChange={handleDateChange(setEndDate)} InputLabelProps={{ shrink: true }} />
                    </Box>
                </CardContent>
            </Card>

            {error && (
                <Alert severity='error' sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <>
                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        {summaryCards.map((card) => (
                            <Grid item xs={12} md={3} key={card.title}>
                                <Card sx={{ borderRadius: 3, border: '1px solid #e5e7eb' }}>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                            <Typography variant='overline' color='text.secondary'>
                                                {card.title}
                                            </Typography>
                                            <Chip label={card.status} size='small' color={card.statusColor} />
                                        </Box>
                                        <Typography variant='h4' sx={{ fontWeight: 700 }}>
                                            {card.value}
                                        </Typography>
                                        <Typography variant='body2' color='text.secondary'>
                                            {card.helper}
                                        </Typography>
                                        <Typography variant='caption' color='text.secondary'>
                                            {card.change}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>

                    <Grid container spacing={3}>
                        <Grid item xs={12} md={7}>
                            <Card sx={{ borderRadius: 3, border: '1px solid #e5e7eb', mb: 3 }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <Typography variant='h6'>Momentum</Typography>
                                        <ToggleButtonGroup value={activeChart} exclusive onChange={(_e, val) => val && setActiveChart(val)} size='small'>
                                            <ToggleButton value='revenue'>Revenue</ToggleButton>
                                            <ToggleButton value='sessions'>Sessions</ToggleButton>
                                        </ToggleButtonGroup>
                                    </Box>
                                    <Chart
                                        chartType='AreaChart'
                                        width='100%'
                                        height='320px'
                                        data={activeChart === 'revenue' ? revenueSeries : sessionsSeries}
                                        options={{
                                            legend: { position: 'none' },
                                            colors: activeChart === 'revenue' ? ['#ef4444'] : ['#2563eb'],
                                            chartArea: { width: '90%', height: '75%' },
                                            hAxis: { format: 'MMM d' },
                                            vAxis: { minValue: 0 },
                                            areaOpacity: 0.2,
                                            lineWidth: 3,
                                        }}
                                    />
                                </CardContent>
                            </Card>

                            <Card sx={{ borderRadius: 3, border: '1px solid #e5e7eb' }}>
                                <CardContent>
                                    <Typography variant='overline' color='text.secondary'>MOCK DATA</Typography>
                                    <Typography variant='h6'>Web performance & conversion</Typography>
                                    <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
                                        GA4 + WooCommerce blueprint (mock data).
                                    </Typography>
                                    <Grid container spacing={2}>
                                        {webPerfMetrics.map((item) => (
                                            <Grid item xs={12} sm={6} key={item.label}>
                                                <Card variant='outlined' sx={{ borderRadius: 2 }}>
                                                    <CardContent>
                                                        <Typography variant='subtitle2'>{item.label}</Typography>
                                                        <Typography variant='h5' sx={{ fontWeight: 600 }}>
                                                            {item.value}
                                                        </Typography>
                                                        <Typography variant='body2' color='text.secondary'>
                                                            {item.context}
                                                        </Typography>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                        ))}
                                    </Grid>
                                    <Divider sx={{ my: 2 }} />
                                    <Typography variant='subtitle2' sx={{ mb: 1 }}>Slowest experiences · Device friction index</Typography>
                                    <Stack spacing={1}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.2, borderRadius: 1, background: '#fff' }}>
                                            <Box>
                                                <Typography variant='body2'>/originals/griffey</Typography>
                                                <Typography variant='caption' color='text.secondary'>Mobile · LCP 4.8s</Typography>
                                            </Box>
                                            <Chip label='$12K · NEEDS FIX' color='error' size='small' />
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.2, borderRadius: 1, background: '#fff' }}>
                                            <Box>
                                                <Typography variant='body2'>/drops/legends</Typography>
                                                <Typography variant='caption' color='text.secondary'>Desktop · INP 340ms</Typography>
                                            </Box>
                                            <Chip label='$3.8K · DEGRADED' color='warning' size='small' />
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.2, borderRadius: 1, background: '#fff' }}>
                                            <Box>
                                                <Typography variant='body2'>/cart</Typography>
                                                <Typography variant='caption' color='text.secondary'>Mobile · CLS 0.22</Typography>
                                            </Box>
                                            <Chip label='$2.4K · WATCH' color='info' size='small' />
                                        </Box>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid item xs={12} md={5}>
                            <Card sx={{ borderRadius: 3, border: '1px solid #e5e7eb', mb: 3 }}>
                                <CardContent>
                                    <Typography variant='overline' color='text.secondary'>MOCK DATA</Typography>
                                    <Typography variant='h6'>Revenue operations</Typography>
                                    <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
                                        FunnelKit + CRM telemetry preview.
                                    </Typography>
                                    <Box sx={{ mb: 3 }}>
                                        <Typography variant='body2' color='text.secondary'>Revenue pace vs goal</Typography>
                                        <Box sx={{ height: 12, borderRadius: 6, background: '#f1f5f9', mt: 1, overflow: 'hidden' }}>
                                            <Box sx={{ width: `${Math.min(100, revenueVsGoal)}%`, height: '100%', background: 'linear-gradient(90deg,#ef4444,#f97316,#84cc16)' }} />
                                        </Box>
                                        <Typography variant='caption' color='text.secondary'>
                                            {formatCurrency(revenue)} / ${revenueGoal.toLocaleString()} · {revenueVsGoal}%
                                        </Typography>
                                    </Box>
                                    <Grid container spacing={2}>
                                        <Grid item xs={6}>
                                            <Typography variant='subtitle2'>AOV momentum</Typography>
                                            <Typography variant='h5'>{formatCurrency(avgOrderValue)}</Typography>
                                            <Typography variant='caption' color='text.secondary'>Live WooCommerce AOV</Typography>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Typography variant='subtitle2'>Upsell attach rate</Typography>
                                            <Typography variant='h5'>31%</Typography>
                                            <Typography variant='caption' color='text.secondary'>-3 pts vs baseline</Typography>
                                        </Grid>
                                    </Grid>
                                    <Divider sx={{ my: 2 }} />
                                    <Typography variant='subtitle2' sx={{ mb: 1 }}>High-value lead queue</Typography>
                                    <Stack spacing={1.5}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.2, borderRadius: 1, background: '#fff' }}>
                                            <Box>
                                                <Typography variant='body2' sx={{ fontWeight: 600 }}>Collector 214</Typography>
                                                <Typography variant='caption' color='text.secondary'>Offer sent · Send video proof</Typography>
                                            </Box>
                                            <Chip label='$8.5K · DUE NOW' size='small' color='error' />
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.2, borderRadius: 1, background: '#fff' }}>
                                            <Box>
                                                <Typography variant='body2' sx={{ fontWeight: 600 }}>Metro Gallery</Typography>
                                                <Typography variant='caption' color='text.secondary'>Negotiating · Share framing mock</Typography>
                                            </Box>
                                            <Chip label='$15K · WORKING' size='small' color='success' />
                                        </Box>
                                    </Stack>
                                </CardContent>
                            </Card>

                            <Card sx={{ borderRadius: 3, border: '1px solid #e5e7eb' }}>
                                <CardContent>
                                    <Typography variant='h6' sx={{ mb: 2 }}>Funnel performance</Typography>
                                    <Table size='small'>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Funnel</TableCell>
                                                <TableCell>Step</TableCell>
                                                <TableCell align='right'>Entries</TableCell>
                                                <TableCell align='right'>Completions</TableCell>
                                                <TableCell align='right'>Conversion %</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {funnelMetrics.map((row) => (
                                                <TableRow key={`${row.funnelName}-${row.stepName}`}>
                                                    <TableCell>{row.funnelName}</TableCell>
                                                    <TableCell>{row.stepName}</TableCell>
                                                    <TableCell align='right'>{row.entries}</TableCell>
                                                    <TableCell align='right'>{row.completions}</TableCell>
                                                    <TableCell align='right'>{Number(row.conversionRate || 0).toFixed(2)}%</TableCell>
                                                </TableRow>
                                            ))}
                                            {!funnelMetrics.length && (
                                                <TableRow>
                                                    <TableCell colSpan={5} align='center'>No funnel data for this range.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                </>
            )}
        </>
    );

    return (
        <Box sx={{ minHeight: '100vh', background: '#f8f7f2', display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
            <Box
                component='aside'
                sx={{
                    width: { xs: '100%', md: 240 },
                    borderRight: { md: '1px solid #e7e5e4' },
                    borderBottom: { xs: '1px solid #e7e5e4', md: 'none' },
                    background: '#fff',
                    p: 3,
                }}
            >
                <Typography variant='h6' sx={{ fontWeight: 700, mb: 4 }}>
                    OPENCLAW
                </Typography>
                {navSections.map((section) => (
                    <Box key={section.title} sx={{ mb: 4 }}>
                        <Typography variant='overline' color='text.secondary' sx={{ letterSpacing: 1 }}>
                            {section.title}
                        </Typography>
                        <Stack spacing={0.5} mt={1}>
                            {section.items.map((item) => (
                                <Box
                                    key={item.key}
                                    onClick={() => setActiveView(item.key)}
                                    sx={{
                                        cursor: 'pointer',
                                        fontSize: 14,
                                        fontWeight: item.key === activeView ? 600 : 400,
                                        color: item.key === activeView ? '#111827' : '#4b5563',
                                        background: item.key === activeView ? '#e0e7ff' : 'transparent',
                                        borderRadius: 1,
                                        px: 1.5,
                                        py: 0.75,
                                    }}
                                >
                                    {item.label}
                                </Box>
                            ))}
                        </Stack>
                    </Box>
                ))}
            </Box>

            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <AppBar position='static' color='transparent' elevation={0} sx={{ borderBottom: '1px solid #e7e5e4' }}>
                    <Toolbar sx={{ justifyContent: 'space-between' }}>
                        <Box>
                            <Typography variant='subtitle2' color='text.secondary'>OPENCLAW</Typography>
                            <Typography variant='h6' sx={{ fontWeight: 600 }}>Gateway Dashboard</Typography>
                        </Box>
                        <Stack direction='row' spacing={1}>
                            <Chip label='Version dev' size='small' variant='outlined' />
                            <Chip label='Health OK' size='small' color='success' />
                        </Stack>
                    </Toolbar>
                </AppBar>

                <Container maxWidth='xl' sx={{ py: 4 }}>
                    <Box sx={{ mb: 3 }}>
                        <Typography variant='h4' sx={{ fontWeight: 600 }}>{meta.title}</Typography>
                        <Typography variant='body2' color='text.secondary'>{meta.subtitle}</Typography>
                    </Box>

                    {activeView === 'overview' ? renderOverview() : renderPlaceholder()}
                </Container>
            </Box>
        </Box>
    );
};

export default Dashboard;
