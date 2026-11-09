use calmbgm_graph::*;

fn graph(rate: f64) -> Graph {
    let mut g = Graph::new(rate, 2048).unwrap();
    for (id, kind) in [
        (1, Kind::Tone),
        (2, Kind::Lfo),
        (3, Kind::Vca),
        (4, Kind::Mix),
        (5, Kind::Output),
    ] {
        g.add_node(id, kind, 1).unwrap();
    }
    g.connect(1, 1, 3, Link::Audio { input: 0 }).unwrap();
    g.connect(
        2,
        2,
        3,
        Link::Mod {
            param: 0,
            depth: 0.4,
            offset: 0.,
            unipolar: false,
        },
    )
    .unwrap();
    g.connect(3, 3, 4, Link::Audio { input: 0 }).unwrap();
    g.connect(4, 4, 5, Link::Audio { input: 0 }).unwrap();
    g.prepare().unwrap();
    g
}
fn gate(g: &mut Graph, frame: u64, owner: u32, value: bool) {
    g.enqueue(Event {
        frame,
        target: 1,
        owner,
        action: Action::Gate(value),
    })
    .unwrap();
}
fn render(g: &mut Graph, n: usize, block: usize) -> Vec<[f32; 2]> {
    let mut out = Vec::new();
    while out.len() < n {
        let count = block.min(n - out.len());
        g.render(count).unwrap();
        let (l, r) = g.output(count);
        out.extend(l.iter().zip(r).map(|(&l, &r)| [l, r]));
    }
    out
}
#[test]
fn sample_offsets_modulation_and_partitions_at_three_rates() {
    for rate in [44100., 48000., 96000.] {
        let mut a = graph(rate);
        gate(&mut a, 37, 1, true);
        gate(&mut a, 2003, 1, false);
        let pcm = render(&mut a, 2300, 127);
        assert!(pcm[..37].iter().all(|s| *s == [0.; 2]));
        assert!(pcm[2003..].iter().all(|s| *s == [0.; 2]));
        for (i, s) in pcm.iter().enumerate().take(2003).skip(37) {
            let phase = i as f64 * 220. / rate * std::f64::consts::TAU;
            let gain = 0.5 + 0.4 * (i as f64 * 2. / rate * std::f64::consts::TAU).sin();
            assert!((s[0] as f64 - phase.sin() * 0.2 * gain * 0.5).abs() < 1e-7);
            assert!((s[1] as f64 - phase.cos() * 0.2 * gain * 0.5).abs() < 1e-7);
        }
        for block in [1, 64, 128, 511, 2048] {
            let mut b = graph(rate);
            gate(&mut b, 37, 1, true);
            gate(&mut b, 2003, 1, false);
            assert_eq!(pcm, render(&mut b, 2300, block));
        }
    }
}
#[test]
fn owned_instances_and_base_restoration() {
    let mut a = graph(48000.);
    let mut b = graph(48000.);
    gate(&mut a, 0, 1, true);
    a.enqueue(Event {
        frame: 19,
        target: 3,
        owner: 1,
        action: Action::Param {
            param: 0,
            value: 0.3,
        },
    })
    .unwrap();
    a.enqueue(Event {
        frame: 23,
        target: 3,
        owner: 1,
        action: Action::ModEnabled {
            edge: 2,
            enabled: false,
        },
    })
    .unwrap();
    let pcm = render(&mut a, 100, 64);
    assert!(render(&mut b, 100, 64).iter().all(|s| *s == [0.; 2]));
    assert_eq!(a.base(3, 0), Ok(0.3));
    for (i, s) in pcm.iter().enumerate().skip(23) {
        let phase = i as f64 * 220. / 48000. * std::f64::consts::TAU;
        assert!((s[1] as f64 - phase.cos() * 0.2 * 0.3 * 0.5).abs() < 1e-7);
    }
    assert!(a
        .schedule()
        .iter()
        .find(|s| s.id == 3)
        .unwrap()
        .dependencies
        .contains(&2));
}
#[test]
fn ordering_ownership_late_overflow_pause_and_reset() {
    let mut g = graph(48000.);
    gate(&mut g, 0, 1, true);
    gate(&mut g, 0, 2, true);
    gate(&mut g, 0, 1, false);
    assert_ne!(render(&mut g, 1, 1)[0], [0.; 2]); // owner's stale release cannot kill owner 2
    g.paused = true;
    assert_eq!(render(&mut g, 100, 100), vec![[0.; 2]; 100]);
    assert_eq!(g.frame, 1);
    g.paused = false;
    gate(&mut g, 0, 2, false);
    assert_eq!(g.stats.late, 1);
    assert_eq!(render(&mut g, 1, 1)[0], [0.; 2]);
    for i in 0..MAX_EVENTS {
        gate(&mut g, 1000 + i as u64, 3, true);
    }
    assert_eq!(
        g.enqueue(Event {
            frame: 1000,
            target: 1,
            owner: 3,
            action: Action::Gate(true)
        }),
        Err(Error::QueueFull)
    );
    assert_eq!(g.stats.overflow, 1);
    g.cancel_owner(3);
    gate(&mut g, 2, 4, true);
    g.render(1).unwrap();
    g.cancel_owner(4);
    assert_eq!(render(&mut g, 1, 1)[0], [0.; 2]);
    g.reset();
    assert_eq!(g.frame, 0);
    assert_eq!(g.stats.applied, 0);
    assert_eq!(render(&mut g, 1, 1)[0], [0.; 2]);
}
#[test]
fn rejects_invalid_contracts_graphs_and_resource_bounds() {
    assert!(Graph::new(f64::NAN, 128).is_err());
    assert!(Graph::new(48000., 2049).is_err());
    let mut g = Graph::new(48000., 128).unwrap();
    g.add_node(1, Kind::Vca, 1).unwrap();
    g.add_node(2, Kind::Vca, 1).unwrap();
    g.add_node(3, Kind::Output, 1).unwrap();
    assert_eq!(g.add_node(1, Kind::Tone, 1), Err(Error::Duplicate));
    assert_eq!(g.set_base(1, 0, f32::NAN), Err(Error::Bounds));
    assert_eq!(
        g.connect(8, 99, 1, Link::Audio { input: 0 }),
        Err(Error::Missing)
    );
    assert_eq!(
        g.connect(
            9,
            1,
            2,
            Link::Mod {
                param: 0,
                depth: 1.,
                offset: 0.,
                unipolar: false
            }
        ),
        Err(Error::Contract)
    );
    assert_eq!(g.prepare(), Err(Error::Missing));
    g.connect(1, 1, 2, Link::Audio { input: 0 }).unwrap();
    g.connect(2, 2, 1, Link::Audio { input: 0 }).unwrap();
    g.connect(3, 2, 3, Link::Audio { input: 0 }).unwrap();
    assert_eq!(
        g.connect(4, 1, 3, Link::Audio { input: 0 }),
        Err(Error::Duplicate)
    );
    assert_eq!(g.prepare(), Err(Error::Cycle));
    let mut g = graph(48000.);
    assert_eq!(g.render(2049), Err(Error::Bounds));
    assert_eq!(g.add_node(9, Kind::Tone, 1), Err(Error::State));
    assert_eq!(
        g.enqueue(Event {
            frame: MAX_FRAME + 1,
            target: 1,
            owner: 1,
            action: Action::Gate(true)
        }),
        Err(Error::Frame)
    );
}
