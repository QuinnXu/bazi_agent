// test.js

// 从 paipan.js 文件中导入 analyzeBazi 函数
// require() 是 Node.js 的导入语法，'./paipan' 表示当前文件夹下的 paipan.js 文件
// 这里使用了解构赋值 { analyzeBazi }，意思是只取 paipan.js 里 module.exports 导出的对象中的 analyzeBazi 属性
const { analyzeBazi } = require('./paipan');

// 调用 analyzeBazi 函数，传入参数
// 参数依次是：
// 1. year        出生年份（公历）
// 2. month       出生月份（1-12）
// 3. day         出生日期（1-31）
// 4. hour        出生时（0-23）
// 5. is_solar    是否公历（true=公历，false=农历）
// 6. is_female   是否为女性（true=女命，false=男命）
// 7. is_leap     是否农历闰月（仅在农历时使用，这里一般传 false）
// 8. longitude   出生地经度（影响时差计算，例如北京是 116.38，上海是 121.5）
// 9. latitude    出生地纬度（影响排盘精度，例如北京是 39.90，上海是 31.2）
const result = analyzeBazi(
    1994,   // 出生年：1994 年
    9,      // 出生月：9 月
    23,     // 出生日：23 日
    8,      // 出生时：上午 8 点
    true,   // 输入的日期是否为公历：是
    false,  // 是否为女性：否（男命）
    false,  // 是否闰月：否
    121.5,  // 经度：121.5（上海）
    31.2    // 纬度：31.2（上海）
);

// 打印结果到控制台
// console.log() 是 Node.js/JavaScript 的标准输出函数
// 这里会输出 analyzeBazi 返回的完整八字和大运信息
console.log(result);
