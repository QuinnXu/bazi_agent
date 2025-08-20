function analyzeBazi(year, month, day, hour, options = {}) {
    const { isSolar = true, isFemale = false, longitude, latitude } = options;

    const p = new paipan();
    const gender = isFemale ? 1 : 0;

    const result = p.fatemaps(gender, year, month, day, hour, 0, 0, longitude || 120, latitude || 35);

    const solarDate = `${year}年${month}月${day}日`;
    const lunarDateArr = result.nl;
    const lunarDate = `${lunarDateArr[0]}年${lunarDateArr[5]}${lunarDateArr[6]}`;

    const four_pillars = [
        `年柱：${result.sz[0]}`,
        `月柱：${result.sz[1]}`,
        `日柱：${result.sz[2]}`,
        `时柱：${result.sz[3]}`
    ];

    const dayuns = result.dy.map(dy => {
        const startAge = dy.zqage;
        const startYear = dy.syear;
        const endYear = dy.eyear;
        const ganzhi = dy.zfma + dy.zfmb;
        const liunians = [];
        for (let j = 0; j < 10; j++) {
            const liuNianAge = startAge + j;
            const liuNianYear = startYear + j;
            if (liuNianYear > endYear) break;
            const liuNianGanZhi = getYearGanZhi(liuNianYear);
            liunians.push({
                age: liuNianAge,
                year: liuNianYear,
                ganzhi: liuNianGanZhi
            });
        }

        return {
            age: startAge,
            ganzhi: ganzhi,
            liunians: liunians
        };
    });

    const qy = result.qy;
    const start_yun_date = new Date(qy.y, qy.m - 1, qy.d);
    start_yun_date.setDate(start_yun_date.getDate() + qy.dday);


    return {
        basic_info: {
            sex: isFemale ? '女命' : '男命',
            solar_date: solarDate,
            lunar_date: lunarDate,
            start_yun: `${start_yun_date.getFullYear()}年${start_yun_date.getMonth() + 1}月${start_yun_date.getDate()}日`,
            minggong: result.mg,
            taiyuan: result.ty,
            four_pillars: four_pillars,
            time_correction: longitude !== undefined ? `原始时间: ${hour}时, 校正时间: ${result.h}时` : undefined,
            geo_info: longitude !== undefined ? `地理位置: 北纬${latitude}°, 东经${longitude}°` : undefined
        },
        dayuns_with_liunian: dayuns
    };
}

module.exports = { analyzeBazi };